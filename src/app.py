import base64
import configparser
import os
import time
import requests
from flask import Flask, jsonify, request, render_template
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.ini"
)

config = configparser.ConfigParser()
config.read(CONFIG_PATH)

RL = config["reversinglabs"]
BASE_URL = RL["base_url"].rstrip("/")
USERNAME = RL["username"]
PASSWORD = RL["password"]

# Session provides connection pooling across requests
# SSL verification disabled for corporate proxies (remove in strict environments)
session = requests.Session()
session.auth = (USERNAME, PASSWORD)
session.headers.update({"Accept": "application/json", "Content-Type": "application/json"})
session.verify = False


def rl_request(path, method="GET", body=None, params=None, retries=4, backoff=2.0):
    url = f"{BASE_URL}{path}"
    # /usage/* endpoints return XML by default regardless of Accept header; format=json forces JSON
    params = {**(params or {}), "format": "json"}

    for attempt in range(retries):
        try:
            resp = session.request(method, url, json=body, params=params, timeout=30)
        except requests.RequestException as e:
            return {"error": str(e)}, 500

        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", backoff * (2**attempt)))
            time.sleep(retry_after)
            continue

        # Normalize empty bodies (e.g. 204 from DELETE) to a 200 + {} so the
        # frontend always gets parseable JSON. Werkzeug strips the body on 204.
        if not resp.content:
            status = 200 if resp.ok else resp.status_code
            return {}, status

        try:
            data = resp.json()
        except ValueError:
            # Upstream sometimes returns plain-text errors (e.g. "Limit exceeds the
            # remaining available limit for the license"). Pass the message through
            # verbatim instead of prefixing it with "Non-JSON response:".
            return {
                "error": resp.text.strip()[:500] or f"HTTP {resp.status_code}"
            }, resp.status_code

        # Some endpoints return 200 with a rate-limit error in the body
        errors = data.get("errors") or []
        if errors and any("rate limit" in (e.get("message") or "").lower() for e in errors):
            time.sleep(backoff * (2**attempt))
            continue

        return data, resp.status_code

    return {"error": "Rate limit exceeded after retries"}, 429


def _b64(value):
    return base64.b64encode(value.encode()).decode()


def _pick_args(*keys):
    return {k: request.args[k] for k in keys if k in request.args}


# UI


@app.route("/")
def index():
    return render_template("dashboard.html", page="dashboard")


@app.route("/users")
def users_page():
    return render_template("users.html", page="users")


@app.route("/licenses")
def licenses_page():
    return render_template("licenses.html", page="licenses")


@app.route("/settings")
def settings_page():
    return render_template("settings.html", page="settings")


# Management


@app.route("/api/company")
def company():
    data, status = rl_request("/api/customer_usage/v1/management/companies")
    return jsonify(data), status


@app.route("/api/licenses")
def licenses():
    data, status = rl_request("/api/customer_usage/v1/management/licenses")
    return jsonify(data), status


@app.route("/api/users", methods=["GET"])
def list_users():
    data, status = rl_request(
        "/api/customer_usage/v1/management/users",
        params=_pick_args("page", "page_size"),
    )
    return jsonify(data), status


@app.route("/api/users", methods=["POST"])
def create_user():
    body = request.json or {}
    data, status = rl_request(
        "/api/customer_usage/v1/management/users",
        method="POST",
        body=body,
    )
    return jsonify(data), status


@app.route("/api/users/update", methods=["POST"])
def update_user():
    body = request.json or {}
    username = body.pop("username", "")
    if not username:
        return jsonify({"error": "username is required"}), 400
    data, status = rl_request(
        f"/api/customer_usage/v1/management/users/{_b64(username)}",
        method="PUT",
        body=body,
    )
    return jsonify(data), status


@app.route("/api/users/password-reset", methods=["POST"])
def reset_user_password():
    body = request.json or {}
    username = body.pop("username", "")
    if not username:
        return jsonify({"error": "username is required"}), 400
    data, status = rl_request(
        f"/api/customer_usage/v1/management/users/{_b64(username)}/password-reset",
        method="PUT",
        body=body or None,
    )
    return jsonify(data), status


@app.route("/api/users/detail", methods=["GET"])
def get_user():
    username = request.args.get("username", "")
    if not username:
        return jsonify({"error": "username is required"}), 400
    data, status = rl_request(f"/api/customer_usage/v1/management/users/{_b64(username)}")
    return jsonify(data), status


# Limits


@app.route("/api/limits/user", methods=["GET"])
def list_user_limits():
    username = request.args.get("username", "")
    if not username:
        return jsonify({"error": "username is required"}), 400
    data, status = rl_request(
        f"/api/customer_usage/v1/management/users/{_b64(username)}/limits",
        params=_pick_args("page", "size"),
    )
    return jsonify(data), status


@app.route("/api/limits/license", methods=["GET"])
def list_license_limits():
    strain = request.args.get("strain", "")
    license_id = request.args.get("license_id", "")
    if not strain or not license_id:
        return jsonify({"error": "strain and license_id are required"}), 400
    data, status = rl_request(
        f"/api/customer_usage/v1/management/licenses/{strain}/{license_id}/limits",
        params=_pick_args("page", "size"),
    )
    return jsonify(data), status


@app.route("/api/limits", methods=["POST"])
def create_limit():
    body = request.json or {}
    data, status = rl_request(
        "/api/customer_usage/v1/management/limits",
        method="POST",
        body=body,
    )
    return jsonify(data), status


@app.route("/api/limits/<int:limit_id>", methods=["PUT"])
def update_limit(limit_id):
    body = request.json or {}
    data, status = rl_request(
        f"/api/customer_usage/v1/management/limits/{limit_id}",
        method="PUT",
        body=body,
    )
    return jsonify(data), status


@app.route("/api/limits/<int:limit_id>", methods=["DELETE"])
def delete_limit(limit_id):
    data, status = rl_request(
        f"/api/customer_usage/v1/management/limits/{limit_id}",
        method="DELETE",
    )
    return jsonify(data), status


# Usage


@app.route("/api/usage/daily")
def usage_daily():
    data, status = rl_request(
        "/api/customer_usage/v1/usage/daily",
        params=_pick_args("date", "user"),
    )
    return jsonify(data), status


@app.route("/api/usage/company/daily")
def usage_company_daily():
    data, status = rl_request(
        "/api/customer_usage/v1/usage/company/daily",
        params=_pick_args("date"),
    )
    return jsonify(data), status


@app.route("/api/usage/monthly")
def usage_monthly():
    data, status = rl_request(
        "/api/customer_usage/v1/usage/monthly",
        params=_pick_args("month", "user"),
    )
    return jsonify(data), status


@app.route("/api/usage/company/monthly")
def usage_company_monthly():
    data, status = rl_request(
        "/api/customer_usage/v1/usage/company/monthly",
        params=_pick_args("month"),
    )
    return jsonify(data), status


@app.route("/api/usage/yara")
def usage_yara():
    data, status = rl_request("/api/customer_usage/v1/usage/yara")
    return jsonify(data), status


# Settings


@app.route("/api/settings", methods=["GET"])
def get_settings():
    cfg = configparser.ConfigParser()
    cfg.read(CONFIG_PATH)
    rl = cfg["reversinglabs"] if "reversinglabs" in cfg else {}
    return jsonify(
        {
            "username": rl.get("username", ""),
            "password": rl.get("password", ""),
            "base_url": rl.get("base_url", "").rstrip("/"),
        }
    )


@app.route("/api/settings", methods=["POST"])
def save_settings():
    global BASE_URL, USERNAME, PASSWORD
    body = request.json or {}
    username = body.get("username", "").strip()
    password = body.get("password", "").strip()
    base_url = body.get("base_url", "").strip().rstrip("/")
    if not username or not password or not base_url:
        return jsonify({"error": "username, password, and base_url are required"}), 400

    cfg = configparser.ConfigParser()
    cfg.read(CONFIG_PATH)
    if "reversinglabs" not in cfg:
        cfg["reversinglabs"] = {}
    cfg["reversinglabs"]["username"] = username
    cfg["reversinglabs"]["password"] = password
    cfg["reversinglabs"]["base_url"] = base_url
    with open(CONFIG_PATH, "w") as f:
        cfg.write(f)

    BASE_URL = base_url
    USERNAME = username
    PASSWORD = password
    session.auth = (USERNAME, PASSWORD)

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=False, port=5000, threaded=True)
