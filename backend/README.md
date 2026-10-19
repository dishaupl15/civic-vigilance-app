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

## Testing

To run the tests, use the following command:
```
npm test
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
