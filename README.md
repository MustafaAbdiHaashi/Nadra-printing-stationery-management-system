# Nadra Printing & Stationery Management System

A production-oriented business management system for a printing and stationery shop.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Node.js + Express + TypeScript + Mongoose
- Database: MongoDB running locally on port 27017
- Auth: JWT with role-based permissions

## Local setup

1. Install dependencies:
   - `npm install`
2. Install and start MongoDB on Windows:
   - Download MongoDB Community Server from the official MongoDB site or install through Chocolatey: `choco install mongodb`.
   - Create a data directory such as `C:\data\db`.
   - Start the MongoDB daemon:
     - `mongod --dbpath "C:\data\db"`
   - Confirm the server is listening on `mongodb://localhost:27017`.
3. Create the environment file for the server if needed:
   - Copy `server/.env.example` to `server/.env`
   - Update the values as required
4. Start the app in development mode:
   - `npm run dev`
5. Open the client at `http://localhost:5173`
6. API runs at `http://localhost:4000`

## Required environment configuration

The backend expects the following in `server/.env` (copy `server/.env.example` and replace the placeholders):

```env
MONGODB_URI=mongodb://localhost:27017/nadra_management
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace_with_a_long_random_secret
COOKIE_SECRET=replace_with_a_different_long_random_secret
INITIAL_ADMIN_PASSWORD=replace_with_a_unique_password_at_least_10_characters
```

`JWT_SECRET` and `INITIAL_ADMIN_PASSWORD` must be configured locally and must not be committed. The initial admin password must be at least 10 characters.

## First admin

The app creates an owner user when the database has no users. The initial email is `admin@nadra.local`, and its password is the locally configured `INITIAL_ADMIN_PASSWORD`. Changing this environment value after the account has been created does not change the account password. The app does not create sample customers, suppliers, products, or sales.

Never commit real secrets. Keep `.env` files local and ignored by Git.

## Tests

Run `npm test` from the repo root to execute the backend test suite.
The API tests generate a unique `nadra_test_<id>` database on the configured local MongoDB server and drop only that test database after the run; they do not write to `nadra_management`.

## Build

Run `npm run build` to compile both frontend and backend.

## Notes

MongoDB is required for the production-ready Nadra configuration. The server does not silently fall back to an in-memory database. If MongoDB is unavailable, startup fails with a clear error and the app does not continue in a partial state.
