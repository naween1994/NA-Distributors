import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ScanLine,
  Camera,
  Keyboard,
  ArrowRight,
  Package,
  Plus,
  Printer,
  X,
  CheckCircle2,
  Leaf,
} from 'lucide-react';
import { useApp } from '../context';
import { api, money } from '../api';
import type { Product } from '../types';
import { PageHeader, Card, Button, Field } from '../components/ui';
import { StockForm } from './Inventory';
import Labels from '../components/Labels';
export default function Scanner() {
  const { can, toast } = useApp();
  const [code, setCode] = useState(''),
    [product, setProduct] = useState<Product | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [cameraBusy, setCameraBusy] = useState(false),
    [stock, setStock] = useState(false),
    [labels, setLabels] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const mounted = useRef(true);
  const lookup = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    setError('');
    try {
      const p = await api<Product>('/products/lookup/' + encodeURIComponent(value.trim()));
      setProduct(p);
      setCode(value.trim());
      toast('Product found.');
    } catch (e) {
      setProduct(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(
    () => () => {
      mounted.current = false;
      controls.current?.stop();
    },
    [],
  );
  const stop = () => {
    controls.current?.stop();
    controls.current = null;
    setCamera(false);
    setCameraBusy(false);
  };
  const start = async () => {
    setError('');
    setCamera(true);
    setCameraBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Camera scanning needs HTTPS or localhost and camera permission. Use manual entry below.',
        );
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const element = video.current;
      if (!element) throw new Error('Camera could not be started.');
      const scanner = await reader.decodeFromVideoDevice(
        undefined,
        element,
        (result, _error, scannerControls) => {
          if (result) {
            scannerControls.stop();
            controls.current = null;
            setCamera(false);
            setCameraBusy(false);
            void lookup(result.getText());
          }
        },
      );
      if (!mounted.current) {
        scanner.stop();
        return;
      }
      controls.current = scanner;
      setCameraBusy(false);
    } catch (e) {
      stop();
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="LESS TYPING. MORE DOING."
        title="Scan & go"
        description="One code. The right product. Everything you need to know."
      />
      <div className="scanner-layout">
        <Card className="scanner-card">
          <div className="card-heading">
            <div>
              <h2>Find your product</h2>
              <p>Use your camera, a scanner or a little typing.</p>
            </div>
            <ScanLine size={22} />
          </div>
          <div className={'camera-stage ' + (camera ? 'running' : '')}>
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              className={camera ? '' : 'hidden-video'}
            />
            {!camera ? (
              <>
                <div className="scan-target">
                  <ScanLine size={58} strokeWidth={1.3} />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <h3>A small scan. A faster day.</h3>
                <p>Point your camera at a barcode or QR label.</p>
                <Button onClick={() => void start()}>
                  <Camera size={17} />
                  Start camera
                </Button>
              </>
            ) : (
              <>
                <div className="camera-crosshair" />
                {cameraBusy && <span className="camera-message">Connecting to camera…</span>}
                <button className="camera-stop button secondary" onClick={stop}>
                  <X size={16} />
                  Stop camera
                </button>
              </>
            )}
          </div>
          <div className="scanner-divider">
            <span>OR ENTER A CODE</span>
          </div>
          <form
            className="scanner-manual"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(code);
            }}
          >
            <Field label="Barcode, QR value or product SKU">
              <div className="scan-code-input">
                <Keyboard size={19} />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Scan or type your code here"
                  required
                  maxLength={150}
                  autoComplete="off"
                />
                <Button disabled={busy}>
                  {busy ? (
                    'Finding…'
                  ) : (
                    <>
                      Find product
                      <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </div>
            </Field>
            <p>
              USB and Bluetooth scanners work here too. Select the field and scan; Enter looks up
              your product.
            </p>
          </form>
          {error && (
            <div className="form-error scanner-error" role="alert">
              {error}
            </div>
          )}
        </Card>
        <div>
          <Card className="scan-result">
            <div className="card-heading">
              <h2>Product details</h2>
              {product && <CheckCircle2 size={19} className="text-green" />}
            </div>
            {product ? (
              <div className="scan-result-content">
                <span className="product-avatar large">
                  <Leaf size={34} />
                </span>
                <span className="section-label">{product.category || 'SPICE INVENTORY'}</span>
                <h2>{product.name}</h2>
                <p>{[product.sku, product.size, product.origin].filter(Boolean).join(' · ')}</p>
                <div className={'scan-stock ' + (product.lowStock ? 'low' : '')}>
                  <span>Stock on hand</span>
                  <strong>
                    {product.stock} <small>{product.unit}</small>
                  </strong>
                  <span>{product.lowStock ? 'At or below reorder level' : 'Stock available'}</span>
                </div>
                <div className="scan-price-list">
                  {can('viewCosts') && (
                    <div>
                      <span>Cost</span>
                      <strong>{money(product.cost)}</strong>
                    </div>
                  )}
                  <div>
                    <span>MRP / retail</span>
                    <strong>{money(product.mrp)}</strong>
                  </div>
                  <div>
                    <span>Wholesale</span>
                    <strong>{money(product.wholesale)}</strong>
                  </div>
                  <div>
                    <span>Distributor</span>
                    <strong>{money(product.distributor)}</strong>
                  </div>
                </div>
                <div className="scan-result-actions">
                  {can('createOrders') && (
                    <Link className="button primary" to={'/orders/new?product=' + product.id}>
                      <Plus size={16} />
                      Use in an order
                    </Link>
                  )}
                  {can('manageInventory') && (
                    <Button variant="secondary" onClick={() => setStock(true)}>
                      <Package size={16} />
                      Adjust stock
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setLabels(true)}>
                    <Printer size={16} />
                    Print product labels
                  </Button>
                </div>
              </div>
            ) : (
              <div className="scan-result-empty">
                <span>
                  <Package size={34} strokeWidth={1.3} />
                </span>
                <h3>The right details, right here.</h3>
                <p>Look up a product to check stock, create an order or print fresh labels.</p>
              </div>
            )}
          </Card>
          <div className="scanner-tip">
            <ScanLine size={21} />
            <div>
              <strong>Labels that work for you</strong>
              <p>
                Every product supports a barcode or QR sticker. No barcode? Your SKU works as a
                code.
              </p>
            </div>
          </div>
        </div>
      </div>
      {stock && product && (
        <StockForm
          product={product}
          onClose={() => setStock(false)}
          onSaved={() => {
            setStock(false);
            void lookup(code);
          }}
        />
      )}
      {labels && product && <Labels product={product} onClose={() => setLabels(false)} />}
    </>
  );
}
