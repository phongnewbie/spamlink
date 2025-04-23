# Server Setup

## Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Update the following variables in `.env`:

- `PORT`: Port number for the server (default: 5000)
- `MONGODB_URI`: Your MongoDB connection string
- `JWT_SECRET`: A secure random string for JWT token signing

## MongoDB Atlas Setup

1. Create a MongoDB Atlas account
2. Create a new cluster
3. Create a database user
4. Get your connection string
5. Replace the placeholders in MONGODB_URI with your actual values:
   - `<your_username>`: Your database username
   - `<your_password>`: Your database password
   - `<your_cluster>`: Your cluster address
   - `<your_database>`: Your database name

## Installation

```bash
npm install
```

## Running the Server

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```
