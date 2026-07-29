import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useEffect, useState } from 'react';
// import { createWhiteChainClient } from 'whitechain-sdk';

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Welcome to Whitechain</h1>
      
      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Wallet Connection</h2>
        
        {isConnected ? (
          <div>
            <p>Connected: <strong>{address}</strong></p>
            <button 
              onClick={() => disconnect()}
              style={{ padding: '8px 16px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button 
            onClick={() => connect({ connector: injected() })}
            style={{ padding: '8px 16px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Connect Wallet
          </button>
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>Whitechain SDK Integration</h2>
        <p>The Whitechain SDK is ready to use! Import it and initialize with your provider:</p>
        <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', overflowX: 'auto' }}>
          {`import { createWhiteChainClient } from 'whitechain-sdk';

// Use the client to read/write from the network
const client = createWhiteChainClient({
  // config
});`}
        </pre>
      </div>
    </div>
  );
}
