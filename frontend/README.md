# ReplyFlow - Frontend

React frontend for ReplyFlow Instagram Auto-DM automation tool.

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Tailwind CSS** - Styling

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/       # Reusable components
│   │   ├── Navbar.jsx
│   │   └── ProtectedRoute.jsx
│   ├── pages/           # Page components
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── ConnectInstagram.jsx
│   │   ├── CreateAutomation.jsx
│   │   └── Automations.jsx
│   ├── utils/           # Utility functions
│   │   ├── api.js       # API client
│   │   └── auth.js      # Auth helpers
│   ├── App.jsx          # Main app component
│   ├── main.jsx         # Entry point
│   └── index.css        # Global styles
├── index.html
├── vite.config.js
└── tailwind.config.js
```

## Features

- User authentication with JWT
- Instagram account connection via OAuth
- Create and manage automations
- Keyword-based comment monitoring
- Automatic DM responses
- Real-time automation toggle
- Trigger statistics and history

## API Integration

The frontend connects to the backend API at `http://localhost:5000/api` by default. This can be configured in `src/utils/api.js`.

## Environment

No environment variables required - API configuration is in the code.

## Design

- Dark theme with slate background
- Purple/blue gradient accents
- Responsive card-based layouts
- Clean, modern UI with hover effects
