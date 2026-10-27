# Nadra Printing & Stationery Management System

A full-stack business management system for Nadra Printing & Stationery. It centralizes sales, inventory, customers, printing orders, payments, expenses, and business performance in a modern dashboard.

## Features

- Dashboard and business analytics
- Point of sale and sales history
- Inventory and product management
- Customer and supplier records
- Printing orders and services
- Payments, purchases, and expenses
- Responsive interface with light and dark themes
- Role-based access for business staff

## Technology stack

- Frontend: React, TypeScript, Vite, and Tailwind CSS
- Backend: Node.js, Express, and TypeScript
- Database: MongoDB with Mongoose
- Authentication: JWT and role-based permissions

## Local setup

1. Install dependencies with `npm install`.
2. Install and start MongoDB on Windows. For example, create `C:\data\db` and run `mongod --dbpath "C:\data\db"`.
3. Copy `server/.env.example` to `server/.env` and replace the placeholders with local configuration.
4. Start the application with `npm run dev`.
5. Open the client at `http://localhost:5173`. The API runs at `http://localhost:4000`.

## Environment configuration

The backend reads configuration from `server/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/nadra_management
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace_with_a_long_random_secret
COOKIE_SECRET=replace_with_a_different_long_random_secret
INITIAL_ADMIN_PASSWORD=replace_with_a_unique_password_at_least_10_characters
```

Replace the placeholders locally. `JWT_SECRET` is required, and `INITIAL_ADMIN_PASSWORD` must be at least 10 characters. Never commit real secrets or `.env` files.

## First admin

If the database has no users, the app creates an owner account with the email `admin@nadra.local` and the password configured in `INITIAL_ADMIN_PASSWORD`. Changing this environment value after the account has been created does not change the account password. The app does not create sample customers, suppliers, products, or sales.

## Tests

Run `npm test` from the project root to execute the backend test suite. Tests use a unique `nadra_test_<id>` database on the configured local MongoDB server and drop only that test database after the run; they do not write to `nadra_management`.

## Build

Run `npm run build` to compile the frontend and backend.

## Notes

MongoDB is required. The server does not silently fall back to an in-memory database; startup fails with a clear error if MongoDB is unavailable.

The project is under active development, and features and interface improvements may evolve.
