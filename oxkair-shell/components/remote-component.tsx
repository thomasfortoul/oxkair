'use client';

import { useEffect, useState, useRef } from 'react';

// Map of remote scopes to their base URLs
const remoteUrls: Record<string, string> = {
  editor: process.env.NEXT_PUBLIC_EDITOR_URL || 'http://localhost:3002',
  coder: process.env.NEXT_PUBLIC_CODER_URL || 'http://localhost:3001',
};

// Interface for remote component props
interface RemoteComponentProps {
  onLoaded?: () => void;
  onError?: (error: Error) => void;
  path?: string; // Optional path to append to the base URL
  height?: string | number; // Optional iframe height
  width?: string | number; // Optional iframe width
  className?: string; // Optional CSS class
}

/**
 * Creates a component that loads a remote application in an iframe
 *
 * @param scope The name of the remote application (e.g., 'editor', 'coder')
 * @param defaultPath The default path to load in the remote application
 * @returns A React component that renders the remote application in an iframe
 */
export function createRemoteComponent(scope: string, defaultPath: string = '/') {
  return function RemoteComponentWrapper({
    onLoaded,
    onError,
    path = defaultPath,
    height = '100%',
    width = '100%',
    className = '',
  }: RemoteComponentProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [url, setUrl] = useState<string>('');
    const [authRefreshInterval, setAuthRefreshInterval] = useState<NodeJS.Timeout | null>(null);
    const [heartbeatMissed, setHeartbeatMissed] = useState(0);

    useEffect(() => {
      // Get the base URL for the remote application
      const baseUrl = remoteUrls[scope];
      if (!baseUrl) {
        const err = new Error(`Unknown remote scope: ${scope}`);
        setError(err);
        setLoading(false);
        if (onError) onError(err);
        return;
      }

      // Construct the full URL
      const fullUrl = `${baseUrl}${path}`;
      setUrl(fullUrl);
      console.log(`Loading remote ${scope} from ${fullUrl}`);

      // Set up a timeout to detect if the iframe fails to load
      const timeoutId = setTimeout(() => {
        if (loading) {
          console.warn(`Remote ${scope} is taking longer than expected to load, but we'll keep trying...`);
          // Instead of immediately failing, we'll extend the timeout
          const extendedTimeoutId = setTimeout(() => {
            if (loading) {
              const err = new Error(`Timeout: Remote ${scope} took too long to load`);
              setError(err);
              setLoading(false);
              if (onError) onError(err);
            }
          }, 750000); // Additional 750 second timeout
          
          return () => clearTimeout(extendedTimeoutId);
        }
      }, 450000); // Initial 450 second timeout

      return () => {
        clearTimeout(timeoutId);
        if (authRefreshInterval) {
          clearInterval(authRefreshInterval);
        }
      };
    }, [scope, path, onError]);

    // Add logging for loading state and heartbeat missed count
    useEffect(() => {
      console.log(`Remote ${scope} State: Loading = ${loading}, Heartbeat Missed = ${heartbeatMissed}`);
    }, [loading, heartbeatMissed, scope]);

    // Handle iframe load event
    const handleLoad = () => {
      console.log(`Remote ${scope} loaded successfully`);
      setLoading(false);
      if (onLoaded) onLoaded();

      // Set up message passing between parent and iframe
      try {
        // Expose auth to the iframe
        const iframe = iframeRef.current;
        if (iframe && iframe.contentWindow) {
          // Send auth information to the iframe
          const sendAuthInfo = () => {
            const shellAuth = (window as any).__SHELL_AUTH__;
            // Add null check before using postMessage
            if (!iframe || !iframe.contentWindow) {
              console.warn('Cannot send auth info: iframe or contentWindow is null');
              return;
            }
            
            iframe.contentWindow.postMessage({
              type: 'AUTH_INFO',
              auth: shellAuth
                ? {
                    user: shellAuth.user,
                    isLoading: shellAuth.isLoading,
                    isAuthenticated: shellAuth.isAuthenticated,
                    // Do NOT include signOut or any functions!
                  }
                : null
            }, '*');
          };
          
          // Send auth info immediately, but with a slight delay to ensure iframe is ready
          setTimeout(sendAuthInfo, 500);
          
          // Set up interval to periodically refresh auth info (helps with timeouts)
          const authRefreshInterval = setInterval(() => {
            try {
              if (iframe && iframe.contentWindow) {
                sendAuthInfo();
              }
            } catch (err) {
              console.warn('Error refreshing auth info:', err);
            }
          }, 5000);
          
          // Store the interval ID for cleanup
          setAuthRefreshInterval(authRefreshInterval);
        }
      } catch (err) {
        console.error('Error setting up communication with iframe:', err);
      }
    };

    // Handle iframe error event
    const handleError = () => {
      const err = new Error(`Failed to load remote ${scope}`);
      setError(err);
      setLoading(false);
      if (onError) onError(err);
    };

    // Retry loading the iframe
    const handleRetry = () => {
      setError(null);
      setLoading(true);
      // Force iframe reload by temporarily clearing the URL
      setUrl('');
      setTimeout(() => {
        setUrl(`${remoteUrls[scope]}${path}`);
      }, 100);
    };

    // Set up heartbeat to detect if iframe is responsive
    useEffect(() => {
      if (!iframeRef.current || !url) return;
      
      // Set up heartbeat to detect if iframe is responsive
      const heartbeatInterval = setInterval(() => {
        try {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'HEARTBEAT' }, '*');
          }
        } catch (err) {
          console.error('Heartbeat error:', err);
        }
      }, 10000); // Every 10 seconds
      
      // Set up heartbeat response listener
      const heartbeatListener = (event: MessageEvent) => {
        if (event.data && event.data.type === 'HEARTBEAT_RESPONSE') {
          // Iframe is responsive, reset timeout counter
          setHeartbeatMissed(0);
        }
      };
      
      window.addEventListener('message', heartbeatListener);
      
      return () => {
        clearInterval(heartbeatInterval);
        window.removeEventListener('message', heartbeatListener);
      };
    }, [iframeRef.current, url]);

    // Add effect to handle missed heartbeats
    useEffect(() => {
      if (heartbeatMissed > 3) {
        // More than 3 missed heartbeats, reload the iframe
        console.log(`Remote ${scope} not responding, reloading...`);
        handleRetry();
        setHeartbeatMissed(0);
      }
    }, [heartbeatMissed]);

    // Set up message listener for iframe communication
    useEffect(() => {
      // Set up message listener for iframe communication
      const messageHandler = (event: MessageEvent) => {
        // Only process messages from our iframe
        if (!iframeRef.current || !iframeRef.current.contentWindow) return;
        if (event.source !== iframeRef.current.contentWindow) return;
        
        // Handle different message types
        if (event.data && typeof event.data === 'object') {
          switch (event.data.type) {
            case 'PING':
              // Respond to ping from iframe
              iframeRef.current.contentWindow.postMessage({ type: 'PONG' }, '*');
              break;
            case 'HEARTBEAT_RESPONSE':
              // Reset missed heartbeat counter
              setHeartbeatMissed(0);
              break;
            case 'IFRAME_READY':
              // Iframe is fully loaded and ready
              setLoading(false);
              if (onLoaded) onLoaded();
              break;
            case 'IFRAME_ERROR':
              // Iframe encountered an error
              const err = new Error(event.data.message || 'Unknown iframe error');
              setError(err);
              if (onError) onError(err);
              break;
            case 'DOWNLOAD_REQUEST':
              // Handle download request from iframe
              try {
                const { url, filename } = event.data;
                if (url && filename) {
                  // Create a temporary anchor element to trigger download
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  a.style.display = 'none';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  
                  // Respond to iframe that download was initiated
                  iframeRef.current.contentWindow.postMessage({
                    type: 'DOWNLOAD_INITIATED',
                    filename
                  }, '*');
                }
              } catch (err) {
                console.error('Download error:', err);
                iframeRef.current.contentWindow.postMessage({
                  type: 'DOWNLOAD_ERROR',
                  error: (err as Error).message
                }, '*');
              }
              break;
            case 'COPY_TO_CLIPBOARD':
              if (event.data && event.data.text) {
                navigator.clipboard.writeText(event.data.text)
                  .then(() => {
                    if (iframeRef.current && iframeRef.current.contentWindow) {
                      iframeRef.current.contentWindow.postMessage({ type: 'COPY_SUCCESS' }, '*');
                    }
                  })
                  .catch((err) => {
                    if (iframeRef.current && iframeRef.current.contentWindow) {
                      iframeRef.current.contentWindow.postMessage({ type: 'COPY_ERROR', error: err.message }, '*');
                    }
                  });
              }
              break;
          }
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      return () => {
        window.removeEventListener('message', messageHandler);
      };
    }, [iframeRef, onLoaded, onError]);

    // Set up a timer to check if the iframe is taking too long to load
    useEffect(() => {
      if (!url || !iframeRef.current) return;
      
      // Set up a timer to check if the iframe is taking too long to load
      const loadTimeoutId = setTimeout(() => {
        if (loading) {
          console.log(`Remote ${scope} is taking too long to load, attempting recovery...`);
          
          // Try to recover by sending a ping to the iframe
          try {
            if (iframeRef.current && iframeRef.current.contentWindow) {
              iframeRef.current.contentWindow.postMessage({ type: 'PING' }, '*');
              
              // Wait a bit longer before forcing a refresh
              setTimeout(() => {
                if (loading) {
                  console.log(`Recovery attempt failed for ${scope}, refreshing...`);
                  handleRetry();
                }
              }, 10000);
            } else {
              // If we can't access the contentWindow, retry immediately
              handleRetry();
            }
          } catch (err) {
            console.error('Error during recovery attempt:', err);
            handleRetry();
          }
        }
      }, 60000); // 60 seconds timeout (increased from 45)
      
      return () => {
        clearTimeout(loadTimeoutId);
      };
    }, [url, loading, scope]);
    
    // Add session storage for preserving state
    useEffect(() => {
      // Listen for state save requests from the iframe
      const saveStateHandler = (event: MessageEvent) => {
        if (!iframeRef.current || !iframeRef.current.contentWindow) return;
        if (event.source !== iframeRef.current.contentWindow) return;
        
        if (event.data && event.data.type === 'SAVE_STATE') {
          try {
            // Save the state to session storage
            const stateKey = `${scope}_state`;
            sessionStorage.setItem(stateKey, JSON.stringify(event.data.state));
            console.log(`Saved state for ${scope}`);
            
            // Acknowledge the save
            iframeRef.current.contentWindow.postMessage({
              type: 'STATE_SAVED'
            }, '*');
          } catch (err) {
            console.error('Error saving state:', err);
          }
        }
      };
      
      window.addEventListener('message', saveStateHandler);
      
      // When the iframe loads, check if we have saved state to restore
      if (!loading && iframeRef.current && iframeRef.current.contentWindow) {
        try {
          const stateKey = `${scope}_state`;
          const savedState = sessionStorage.getItem(stateKey);
          
          if (savedState) {
            console.log(`Found saved state for ${scope}, attempting to restore...`);
            iframeRef.current.contentWindow.postMessage({
              type: 'RESTORE_STATE',
              state: JSON.parse(savedState)
            }, '*');
          }
        } catch (err) {
          console.error('Error restoring state:', err);
        }
      }
      
      return () => {
        window.removeEventListener('message', saveStateHandler);
      };
    }, [scope, loading]);

    if (error) {
      return (
        <div className="p-4 text-center border border-red-300 rounded-md bg-red-50">
          <div className="text-red-600 font-medium mb-2">
            Error loading {scope}:
          </div>
          <div className="text-red-500 mb-4">{error.message}</div>
          <button
            onClick={handleRetry}
            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      );
    }

    return (
      <div
        className={`remote-component-wrapper ${className}`}
        style={{
          position: 'relative',
          height,
          width,
          overflow: 'hidden',
          borderRadius: '0.375rem',
          backgroundColor: 'white',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <div className="text-blue-600 font-medium">Loading {scope}...</div>
            </div>
          </div>
        )}
        {url && (
          <iframe
            ref={iframeRef}
            src={url}
            onLoad={handleLoad}
            onError={handleError}
            className="w-full h-full border-0"
            style={{ height: '100%', width: '100%' }}
            title={`${scope} application`}
            allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; xr-spatial-tracking; downloads"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
          />
        )}
      </div>
    );
  };
}