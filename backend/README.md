# Civic Vigilance Backend

This folder contains the Civic Vigilance Node.js API, Supabase migrations, and retired Edge Function endpoints.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/Vijendrapratap/Civic-Vigilance.git
   ```
2. Navigate to the backend directory:
   ```
   cd Civic-Vigilance/backend
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Create the backend environment file and add the server-only secrets:
   ```
   cp .env.example .env
   ```

## Usage

To start the server, run the following command:
```
npm start
```
The server will be running on `http://localhost:3000`; API routes are mounted under `/api`.

X sharing is user-mediated through the frontend composer. The backend does not collect or store X OAuth tokens.

## Optional AI report-writing assistance

`POST /api/generate-report-content` is an authenticated, rate-limited endpoint.
It requires explicit `privacy_notice_accepted: true` and sends only the
user-entered title, category, and description to the configured text provider.
The app does not send report photos, address, or coordinates for this feature.
The user must review generated drafts and explicitly apply any title,
description, or category change; summaries, captions, and hashtags remain
separate drafts.

The optional server-only `AI_TEXT_ENDPOINT` and `AI_TEXT_API_KEY` variables
must be configured together. The HTTPS provider endpoint must accept the JSON
request shape in `src/report-content.js` and return the requested JSON object
directly. No provider is bundled or assumed. If either variable is absent, the
endpoint reports that AI assistance is unavailable and normal report
submission remains available. Never place these credentials in the frontend
or in an `EXPO_PUBLIC_` variable.

Authority account suggestions come from the frontend's local authority seed
directory and jurisdiction/category matching. That data is not live-verified;
the UI labels it unverified, allows opt-in selection, and does not contact an
authority. Department-level suggestions are generic guidance, not verified
contacts.

## Testing

To run the tests, use the following command:
```
npm test
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
