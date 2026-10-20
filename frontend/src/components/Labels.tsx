import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import type { Product } from '../types';
import { money } from '../api';
import { Modal, Field, Select, Button } from './ui';
export function PrintArea({ children }: { children: React.ReactNode }) {
  return createPortal(<div id="print-root">{children}</div>, document.body);
}
function Barcode({ code }: { code: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      JsBarcode(ref.current, code, {
        format: 'CODE128',
        width: 1.4,
        height: 45,
        fontSize: 11,
        margin: 5,
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, [code]);
  return error ? (
    <small>This code cannot be rendered as CODE128. Use QR.</small>
  ) : (
    <svg ref={ref} />
  );
}
export function Label({ product, type, qr }: { product: Product; type: string; qr: string }) {
  const code = product.barcode || product.sku;
  return (
    <div className="product-label">
      <strong>NA DISTRIBUTORS</strong>
      <h4>{product.name}</h4>
      <span>
        {product.size}
        {product.size && product.grade ? ' · ' : ''}
        {product.grade}
      </span>
      {type === 'qr' ? <img src={qr} alt={'QR for ' + code} /> : <Barcode code={code} />}
      <div>
        {type === 'qr' && <span>{code}</span>}
        <b>{money(product.mrp)}</b>
      </div>
    </div>
  );
}
export default function Labels({ product, onClose }: { product: Product; onClose: () => void }) {
  const [type, setType] = useState('barcode'),
    [copies, setCopies] = useState(6),
    [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(product.barcode || product.sku, { width: 200, margin: 1 }).then(setQr);
  }, [product]);
  return (
    <Modal
      title="Print product stickers"
      subtitle={product.name + ' · ' + product.sku}
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="form-grid">
          <Field label="Label type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="barcode">Barcode (CODE128)</option>
              <option value="qr">QR code</option>
            </Select>
          </Field>
          <Field label="Number of labels">
            <input
              type="number"
              min={1}
              max={120}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
            />
          </Field>
        </div>
        <div className="label-preview">
          <Label product={product} type={type} qr={qr} />
        </div>
        <p className="muted small">
          Print at actual size on A4 label paper. Check alignment with a plain paper test first.
        </p>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer size={17} />
            Print {copies} labels
          </Button>
        </div>
      </div>
      <PrintArea>
        <div className="print-labels">
          {Array.from({ length: copies }, (_, i) => (
            <Label key={i} product={product} type={type} qr={qr} />
          ))}
        </div>
      </PrintArea>
    </Modal>
  );
}
