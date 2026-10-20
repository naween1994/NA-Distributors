import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Download,
  QrCode,
  Settings2,
  ArrowUpRight,
  MonitorSmartphone,
  ScanLine,
  ShieldCheck,
  Code2,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader, Card, Button } from '../components/ui';
import { ConnectionSettings } from './Login';
import { backendUrl } from '../api';
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export default function Mobile() {
  const [qr, setQr] = useState(''),
    [prompt, setPrompt] = useState<InstallPrompt | null>(null),
    [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches),
    [connection, setConnection] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(location.origin, {
      width: 240,
      margin: 2,
      color: { dark: '#245b45', light: '#ffffff' },
    }).then(setQr);
    const before = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const install = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', install);
    return () => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', install);
    };
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="BUSINESS DOESN’T STAY AT A DESK"
        title="Take your workspace with you."
        description="From the warehouse floor to your customer’s door."
      />
      <div className="mobile-layout">
        <Card className="mobile-feature-card">
          <div className="mobile-feature-icon">
            <Smartphone size={39} strokeWidth={1.3} />
          </div>
          <span className="eyebrow">YOUR EVERYDAY BUSINESS. IN YOUR POCKET.</span>
          <h2>A lighter way to keep moving.</h2>
          <p>
            Install NA Distributors as a web app for quick access to your inventory, customers and
            orders.
          </p>
          <div className="mobile-benefits">
            <span>
              <CheckCircle2 size={17} />
              Responsive across phone, tablet and desktop
            </span>
            <span>
              <ScanLine size={17} />
              Camera scanning on compatible secure browsers
            </span>
            <span>
              <ShieldCheck size={17} />
              The same permissions, the same saved records
            </span>
          </div>
          <Button
            disabled={installed}
            onClick={async () => {
              if (prompt) {
                await prompt.prompt();
                const result = await prompt.userChoice;
                if (result.outcome === 'accepted') setInstalled(true);
                setPrompt(null);
              } else
                document
                  .getElementById('install-instructions')
                  ?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <Download size={17} />
            {installed
              ? 'Installed as a web app'
              : prompt
                ? 'Install web app'
                : 'View install instructions'}
          </Button>
          <small>Internet and the backend are required to read and save business records.</small>
        </Card>
        <Card className="mobile-qr-card">
          <div className="card-heading">
            <div>
              <h2>Open on your phone</h2>
              <p>Scan this code with your camera.</p>
            </div>
            <QrCode size={22} />
          </div>
          {qr && <img src={qr} alt="QR code linking to this NA Distributors website" />}
          <strong>{location.host}</strong>
          <p>
            The phone must be able to reach this address. A localhost address is only available on
            the device running the server.
          </p>
        </Card>
      </div>
      <Card id="install-instructions">
        <div className="card-heading">
          <div>
            <h2>
              <MonitorSmartphone size={20} />
              Make it feel at home.
            </h2>
            <p>Web app installation depends on your browser and a secure HTTPS connection.</p>
          </div>
        </div>
        <div className="installation-grid">
          <div>
            <span className="step-number">01</span>
            <h3>Android · Chrome</h3>
            <p>
              Open this website in Chrome. Tap the browser menu, then{' '}
              <strong>Add to Home screen</strong> or <strong>Install app</strong>. Confirm the
              installation.
            </p>
          </div>
          <div>
            <span className="step-number">02</span>
            <h3>iPhone · Safari</h3>
            <p>
              Open this website in Safari. Tap <strong>Share</strong>, then{' '}
              <strong>Add to Home Screen</strong>. Tap Add to save the app icon.
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <h3>Desktop · Chrome or Edge</h3>
            <p>
              Use the install icon in the address bar, or the browser menu’s{' '}
              <strong>Install NA Distributors</strong> option when available.
            </p>
          </div>
        </div>
      </Card>
      <Card className="backend-card">
        <div>
          <span className="summary-icon">
            <Settings2 size={22} />
          </span>
          <h2>One backend. One source of truth.</h2>
          <p>
            Current API: <code>{backendUrl() || location.origin}/api</code>
          </p>
          <p>
            Use the default same-origin connection for secure session cookies. Separate hosts need
            credentialed CORS and a compatible deployment.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setConnection(true)}>
          Configure connection
          <ArrowUpRight size={16} />
        </Button>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <h2>
              <Code2 size={20} />
              Need an Android APK?
            </h2>
            <p>Developer build instructions · no prebuilt APK is supplied.</p>
          </div>
          <span className="subtle-pill">OPTIONAL</span>
        </div>
        <div className="apk-instructions">
          <p>
            A native wrapper can be built with Capacitor and Android Studio. Build and test it in a
            separate packaging checkout so it does not affect your web deployment.
          </p>
          <ol>
            <li>
              Deploy the web app and API over HTTPS. For the simplest authentication setup, serve
              both on the same origin.
            </li>
            <li>
              Install Capacitor Core, CLI and Android in the packaging project. Initialize with app
              name <strong>NA Distributors</strong>, package ID <code>lk.nadistributors.app</code>,
              and web directory <code>frontend/dist</code>.
            </li>
            <li>
              Configure Capacitor’s server URL to the trusted deployed HTTPS website. Keep cleartext
              traffic disabled and restrict navigation to your application host.
            </li>
            <li>
              Run <code>npm run build</code>, then <code>npx cap add android</code> and{' '}
              <code>npx cap sync android</code>.
            </li>
            <li>
              Run <code>npx cap open android</code>. In Android Studio, configure camera access as
              needed, test sign-in and scans on a device, and use{' '}
              <strong>Build → Generate Signed App Bundle / APK</strong>.
            </li>
          </ol>
          <p className="muted small">
            Requires a supported JDK, Android SDK and Android Studio. Keep signing keys secure.
            Camera permission and native WebView behavior must be tested on the target Android
            versions.
          </p>
          <a
            className="text-link"
            href="https://capacitorjs.com/docs/android"
            target="_blank"
            rel="noreferrer"
          >
            Capacitor Android documentation
            <ExternalLink size={14} />
          </a>
        </div>
      </Card>
      {connection && <ConnectionSettings onClose={() => setConnection(false)} />}
    </>
  );
}
