import { useState } from 'react';
import {
  Settings2,
  Building2,
  Tags,
  CalendarDays,
  Calculator,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  Percent,
  Database,
} from 'lucide-react';
import { useApp } from '../context';
import { useData } from '../hooks';
import { put, post, money, unitPrice } from '../api';
import type { Settings as Config, Product, Tier } from '../types';
import { PageHeader, Card, Field, Select, Button, ConfirmDelete } from '../components/ui';
export default function Settings() {
  const { settings, reloadSettings, toast } = useApp();
  const [values, setValues] = useState<Config>(() => structuredClone(settings!)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reset, setReset] = useState(false),
    [productId, setProductId] = useState(''),
    [cost, setCost] = useState('0'),
    [markup, setMarkup] = useState(String(settings!.distributorMarkup));
  const { data: products } = useData<Product[]>('/products');
  const set = (k: keyof Config, v: unknown) => setValues((old) => ({ ...old, [k]: v }));
  const updateTier = (index: number, key: keyof Tier, value: unknown) =>
    set(
      'pricingTiers',
      values.pricingTiers.map((t, i) => (i === index ? { ...t, [key]: value } : t)),
    );
  return (
    <>
      <PageHeader
        eyebrow="MAKE IT WORK YOUR WAY"
        title="Workspace settings"
        description="Your business details, pricing rules and trade terms."
      >
        <Button form="settings-form" disabled={busy}>
          <Check size={17} />
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
      </PageHeader>
      <form
        id="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await put('/settings', values);
            await reloadSettings();
            toast('Workspace settings saved to the database.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="settings-layout">
          <div className="settings-main">
            <Card>
              <div className="card-heading">
                <div>
                  <h2>
                    <Building2 size={18} />
                    Business details
                  </h2>
                  <p>These details appear on your printed invoices.</p>
                </div>
              </div>
              <div className="card-form">
                <div className="form-grid">
                  {(
                    [
                      ['appName', 'Business name'],
                      ['businessPhone', 'Phone number'],
                      ['businessEmail', 'Email address'],
                    ] as const
                  ).map(([k, l]) => (
                    <Field label={l} key={k}>
                      <input
                        required={k === 'appName'}
                        type={k === 'businessEmail' ? 'email' : 'text'}
                        value={values[k]}
                        onChange={(e) => set(k, e.target.value)}
                        maxLength={2000}
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Business address">
                  <textarea
                    rows={2}
                    value={values.businessAddress}
                    onChange={(e) => set('businessAddress', e.target.value)}
                    maxLength={2000}
                  />
                </Field>
                <Field label="Invoice footer">
                  <input
                    value={values.invoiceFooter}
                    onChange={(e) => set('invoiceFooter', e.target.value)}
                    maxLength={2000}
                  />
                </Field>
              </div>
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <h2>
                    <Tags size={18} />
                    Pricing tiers
                  </h2>
                  <p>Choose a product price source and optional multiplier for each tier.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    set('pricingTiers', [
                      ...values.pricingTiers,
                      {
                        id: 'tier_' + Date.now().toString(36),
                        name: 'New tier',
                        priceKey: 'wholesale',
                        multiplier: 1,
                        active: true,
                      },
                    ])
                  }
                >
                  <Plus size={16} />
                  Add tier
                </Button>
              </div>
              <div className="card-form tier-editor">
                {values.pricingTiers.map((tier, i) => (
                  <div className="tier-editor-row" key={i}>
                    <div className="form-grid">
                      <Field label="Tier name">
                        <input
                          required
                          value={tier.name}
                          onChange={(e) => updateTier(i, 'name', e.target.value)}
                          maxLength={80}
                        />
                      </Field>
                      <Field label="Price source">
                        <Select
                          value={tier.priceKey || tier.id}
                          onChange={(e) => updateTier(i, 'priceKey', e.target.value)}
                        >
                          <option value="mrp">MRP / retail</option>
                          <option value="wholesale">Wholesale</option>
                          <option value="distributor">Distributor</option>
                        </Select>
                      </Field>
                      <Field label="Multiplier" hint="1 = original price; 0.95 = 5% less.">
                        <input
                          type="number"
                          min="0.01"
                          max={100}
                          step="0.01"
                          required
                          value={tier.multiplier ?? 1}
                          onChange={(e) => updateTier(i, 'multiplier', Number(e.target.value))}
                        />
                      </Field>
                      <div className="tier-controls">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={tier.active}
                            onChange={(e) => updateTier(i, 'active', e.target.checked)}
                          />
                          Active
                        </label>
                        <button
                          type="button"
                          className="icon-button danger-text"
                          aria-label={'Remove ' + tier.name + ' tier'}
                          onClick={() =>
                            set(
                              'pricingTiers',
                              values.pricingTiers.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <small className="muted">
                      Tier ID: {tier.id}. Deactivate tiers that are already assigned to customers.
                    </small>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <h2>
                    <CalendarDays size={18} />
                    Payment terms
                  </h2>
                  <p>Practical defaults for your customer accounts.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    set('paymentTerms', [...values.paymentTerms, { name: 'New term', days: 0 }])
                  }
                >
                  <Plus size={16} />
                  Add term
                </Button>
              </div>
              <div className="card-form">
                {values.paymentTerms.map((term, i) => (
                  <div className="term-row" key={i}>
                    <Field label="Term name">
                      <input
                        required
                        value={term.name}
                        onChange={(e) =>
                          set(
                            'paymentTerms',
                            values.paymentTerms.map((t, j) =>
                              j === i ? { ...t, name: e.target.value } : t,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Days until due">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        required
                        value={term.days}
                        onChange={(e) =>
                          set(
                            'paymentTerms',
                            values.paymentTerms.map((t, j) =>
                              j === i ? { ...t, days: Number(e.target.value) } : t,
                            ),
                          )
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      className="icon-button danger-text"
                      aria-label={'Remove ' + term.name}
                      onClick={() =>
                        set(
                          'paymentTerms',
                          values.paymentTerms.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <div className="settings-side">
            <Card>
              <div className="card-heading">
                <div>
                  <h2>
                    <Percent size={18} />
                    Distributor markup
                  </h2>
                  <p>Used as the default for new products.</p>
                </div>
              </div>
              <div className="card-form">
                <Field label="Default markup (%)">
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    step="0.01"
                    value={values.distributorMarkup}
                    onChange={(e) => set('distributorMarkup', Number(e.target.value))}
                  />
                </Field>
                <p className="muted small">
                  Saving this default does not reprice existing products. Edit each product to
                  change its rates.
                </p>
              </div>
            </Card>
            <Card className="discount-guide">
              <h3>Order-volume discounts</h3>
              <p>Manually selected during order entry.</p>
              {values.discounts.map((d) => (
                <div key={d.threshold}>
                  <span>{money(d.threshold)}+</span>
                  <strong>{d.percent}%</strong>
                </div>
              ))}
              <small>One rate per order. No added tax.</small>
            </Card>
            <Card className="storage-card">
              <Database size={24} />
              <h3>Every change has a home.</h3>
              <p>
                Records are saved directly to the Express API and persistent SQLite database.
                Browser storage holds connection preferences only.
              </p>
              <span className="badge healthy">
                <span className="badge-dot" />
                Persistent storage
              </span>
            </Card>
          </div>
        </div>
      </form>
      <Card className="simulator-card">
        <div className="card-heading">
          <div>
            <h2>
              <Calculator size={19} />
              Product price simulator
            </h2>
            <p>Try a rate before changing any product. This calculator does not save prices.</p>
          </div>
          <span className="subtle-pill">PREVIEW ONLY</span>
        </div>
        <div className="card-form">
          <div className="form-grid three">
            <Field label="Use product cost (optional)">
              <Select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  const p = products?.find((p) => p.id === Number(e.target.value));
                  if (p) {
                    setCost(String(p.cost || 0));
                    setMarkup(String(p.markup ?? values.distributorMarkup));
                  }
                }}
              >
                <option value="">Custom calculation</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit cost (Rs.)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </Field>
            <Field label="Distributor markup (%)">
              <input
                type="number"
                min={0}
                max={1000}
                step="0.01"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
              />
            </Field>
          </div>
          <div className="simulator-result">
            <span>
              {money(Number(cost))} × (1 + {markup}% / 100)
            </span>
            <strong>
              {money(Math.round(Number(cost) * (1 + Number(markup) / 100) * 100) / 100)}
            </strong>
            <small>Suggested distributor unit price</small>
          </div>
        </div>
      </Card>
      <div className="danger-zone">
        <div>
          <strong>Restore default settings</strong>
          <p>
            Resets business details, pricing defaults, terms and reminder templates. Records are
            preserved.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setReset(true)}>
          <RotateCcw size={16} />
          Reset settings
        </Button>
      </div>
      {reset && (
        <ConfirmDelete
          title="Restore workspace defaults?"
          description="This restores default settings and clears business header details. Products, customers, orders and users remain. Referenced custom tiers are retained as inactive."
          onClose={() => setReset(false)}
          onConfirm={async (password) => {
            const config = await post<Config>('/settings/reset', { adminPassword: password });
            setValues(config);
            await reloadSettings();
            toast('Default settings restored.');
          }}
        />
      )}
    </>
  );
}
