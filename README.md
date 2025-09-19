# Somnia Stream App

Complete decentralized application for creating, managing, and monitoring real-time token streams on the Somnia network.

## Demo

[**Access the Application**](https://votre-username.github.io/somnia-stream-app)

## Features

### Stream Management
- **Stream creation** with customizable amounts and durations
- **Predefined templates** (quick test, hourly, daily, weekly)
- **Real-time actions**: pause, resume, cancel
- **Instant withdrawals** for recipients

### Advanced Dashboard
- **Real-time metrics**: total, active, paused, completed streams
- **Financial statistics**: deposited, withdrawn, available amounts
- **Role analysis**: sent vs received streams
- **Recent activity** with latest transaction overview

### Filters and Search
- **Filter by status**: all, active, paused, completed
- **Filter by role**: sent, received
- **Search** by stream ID or Ethereum addresses
- **Advanced sorting**: date, amount, progress

### User Interface
- **Modern design** with Tailwind CSS
- **Dark/light mode** toggle
- **Responsive interface** (mobile, tablet, desktop)
- **Toast notifications** for actions
- **Animated progress bars** with real-time updates

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Blockchain**: Ethers.js v5 for Web3 interactions
- **Styling**: Tailwind CSS
- **Build**: Vite
- **Deployment**: GitHub Pages
- **Network**: Somnia Testnet

## Installation & Development

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- MetaMask or Web3-compatible wallet

### Local Setup
```bash
# Clone the repository
git clone https://github.com/your-username/somnia-stream-app.git
cd somnia-stream-app

# Install dependencies
npm install

# Start development server
npm run dev
```

Application will be available at `http://localhost:5173`

### Production Build
```bash
npm run build
```

### Deployment
```bash
npm run deploy
```

## Network Configuration

Application is configured for Somnia Testnet:
- **Chain ID**: [Somnia Network ID]
- **RPC URL**: Automatically configured
- **Explorer**: Links to Somnia explorer

MetaMask will automatically add the network on first connection.

## Usage Guide

### 1. Wallet Connection
1. Click "Connect Wallet"
2. Approve connection in MetaMask
3. Somnia network will be added automatically if needed

### 2. Get Test Tokens
1. Use "Get Tokens" button
2. Confirm transaction in MetaMask
3. Tokens will appear in your balance

### 3. Create a Stream
1. Go to "Create" tab
2. Enter recipient address
3. Set amount and duration
4. Use templates for quick configurations
5. Confirm creation

### 4. Manage Streams
1. View streams in "Streams" tab
2. Use filters to organize display
3. Available actions by role:
   - **Sender**: pause, resume, cancel
   - **Recipient**: withdraw available funds

### 5. Dashboard & Metrics
- View statistics in "Dashboard" tab
- Track financial metrics in real-time
- Check recent activity

## Technical Architecture

### Core Components
- **SomniaStreamApp**: Main component with state management
- **Custom hooks**: validation, filters, toasts
- **Web3 integration**: wallet and smart contract management

### State Management
- **useReducer** for global application state
- **useState** for local component states
- **Custom hooks** for reusable logic

### Validation & Security
- **Real-time form validation**
- **Ethereum address verification**
- **Complete error handling** with fallbacks

## Smart Contracts

The application interacts with:
- **Stream Contract**: manages token flows
- **ERC20 Contract**: test token with integrated faucet

Contract addresses are configured in `src/lib/constants.ts`

## Advanced Features

### Real-Time Calculations
- Dynamic stream progress calculation
- Automatically updated withdrawable amounts
- Paused stream handling

### Adaptive Interface
- Contextual permissions based on user role
- Available actions based on stream state
- Visual feedback for all interactions

### Optimizations
- Lazy data loading
- Contract information caching
- Search debouncing

## Troubleshooting

### Common Issues

**Wallet not connected**
- Verify MetaMask is installed and unlocked
- Refresh page if necessary

**Wrong network**
- Application will automatically switch to Somnia
- Approve network change in MetaMask

**Failed transactions**
- Check token and gas balance
- Wait for previous transaction confirmation

### Support
To report bugs or request features, open an issue on GitHub.

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! To contribute:

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

- [ ] Multi-token integration
- [ ] Push notifications
- [ ] CSV data export
- [ ] Advanced analytics mode
- [ ] Multi-wallet support
- [ ] Developer REST API

---
SOMNIA_STREAM = 0x768bB760569D506D31eE654092EfEC50941DCF88;
TEST_TOKEN = 0xA385AF22e40cC2ee30fC50DD56ec505462518398;

**Built with care for the Somnia ecosystem**
