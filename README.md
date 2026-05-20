# TCA-9999 Viewer

A small Flask web app that wraps the ReversingLabs [Customer Usage](https://docs.reversinglabs.com/SpectraIntelligence/API/CustomerUsage/tca-9999/) management
API behind a friendlier UI. 
- Provides pages for managing users, licenses, limits, and viewing usage reports.
- You will need valid ReversingLabs API credentials to use it.


## Stack

- **Backend**: Python / Flask, single file (`src/app.py`).
- **Frontend**: vanilla JavaScript + HTML templates, no build step.
- **Charts**: Chart.js (vendored at `static/js/chart.umd.min.js`).
- **Icons**: Bootstrap Icons.
- **Storage**: none. Credentials live in `config.ini`; everything else is
  proxied to the upstream RL API in real time.

## Layout

```
config.ini.example      Template for upstream credentials
src/
  app.py                Flask app: routes, upstream proxy, retry logic
  templates/
    base.html           Layout, sidebar, topbar
    dashboard.html      Overview + Usage Reports tabs
    users.html          User list + create/edit/disable/limit modals
    licenses.html       License list
    settings.html       Edit upstream credentials
  static/
    js/
      common.js         apiFetch wrapper, toast, modal, chart helpers
      dashboard.js      Overview, usage reports, queries-by-license
      users.js          Users + per-user limits CRUD
      licenses.js       License table
      settings.js       Settings form
    css/                Bootstrap Icons + handwritten style.css
    images/             Logos
```

## Setup

Requires Python 3.9+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install flask requests urllib3
```

Copy the example config and fill in your credentials:

```bash
cp config.ini.example config.ini
```

```ini
[reversinglabs]
username = u/<company>/<user>
password = <password>
base_url = https://data.reversinglabs.com
```

## Usage

```bash
python3 src/app.py
```
Visit `http://127.0.0.1:5000`.

## Pages

- **Dashboard**: company name, user count, license count, today's usage,
  6-month query trend.
- **Usage Reports**: daily/monthly per-company and per-user breakdowns.
  *Queries by License* tab rolls up product-level totals to the parent
  license, with a per-user drill-down.
- **Users**: list, create, edit, disable, password reset, manage per-user
  quota limits.
- **Licenses**: list with strain, products, validity, status.
- **Settings**: change the credentials and base URL stored in `config.ini`.

## Security notes

- `config.ini` holds plaintext credentials — keep it out of version control
  and restrict filesystem permissions (`chmod 600 config.ini`).
- SSL verification is **disabled** in `app.py` for corporate-proxy
  compatibility. Re-enable it (`verify=True` on `requests` calls) for any
  deployment outside a trusted network.
- The Flask dev server is not production-grade. For anything beyond local
  use, run behind a real WSGI server (gunicorn, uWSGI) and a reverse proxy,
  and add authentication in front — the app itself is unauthenticated.
## Disclaimer of Warranty

This application is provided "as is" and "as available" without any warranties of any kind, either express or implied.

Reversing Labs make no representations or warranties of any kind, including but not limited to:

- The accuracy, completeness, or timeliness of the information submitted or received via this application;
- The functionality, availability, or performance of the application;
- The security, integrity, or confidentiality of submitted files or user data; or
- The fitness of this application for any particular purpose.

Use of this application is at your own risk. By using this application, you acknowledge that any data submitted to third-party services (e.g., ReversingLabs Spectra Analyze) may be subject to their own terms and conditions.

In no event shall the developer be liable for any direct, indirect, incidental, special, exemplary, or consequential damages arising out of or in any way connected with the use or misuse of this application.

## License

MIT — see [LICENSE](LICENSE).
