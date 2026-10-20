export interface User {
  id: number;
  name: string;
  username: string;
  role: string;
  permissions: string[];
  active: boolean;
  passwordSet: boolean;
  mustChangePassword: boolean;
}
export interface Tier {
  id: string;
  name: string;
  active: boolean;
  priceKey?: string;
  multiplier?: number;
}
export interface Settings {
  appName: string;
  currency: string;
  distributorMarkup: number;
  pricingTiers: Tier[];
  paymentTerms: { name: string; days: number }[];
  discounts: { threshold: number; percent: number }[];
  reminderEmail: string;
  reminderSms: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  invoiceFooter: string;
}
export interface Product {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  category: string;
  origin: string;
  size: string;
  grade: string;
  batch: string;
  unit: string;
  stock: number;
  initial_stock: number;
  reorder_level: number;
  cost?: number;
  mrp: number;
  wholesale: number;
  distributor: number;
  markup?: number;
  notes: string;
  lowStock: boolean;
  created_at: string;
}
export interface Customer {
  id: number;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  tier: string;
  terms_days: number;
  credit_limit: number;
  reference: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  order_count: number;
  lifetime_spend: number;
  outstanding: number;
  orders?: Order[];
}
export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number;
  line_total: number;
}
export interface Payment {
  id: number;
  amount: number;
  method: string;
  reference: string;
  paid_date: string;
  recorded_by: string;
}
export interface Order {
  id: number;
  invoice: string;
  customer_id: number;
  customer: Pick<Customer, 'business' | 'contact' | 'phone' | 'email' | 'address'>;
  order_date: string;
  due_date: string;
  tier: string;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
  paid: number;
  balance: number;
  status: 'paid' | 'partial' | 'unpaid';
  overdue: boolean;
  payment_method: string;
  notes: string;
  items?: OrderItem[];
  payments?: Payment[];
}
export interface Summary {
  revenue: number;
  cogs?: number;
  grossProfit?: number;
  margin?: number;
  collected: number;
  outstanding: number;
  orders: number;
  units: number;
}
export interface DashboardData {
  summary: Summary;
  inventory: { products: number; units: number; value?: number; low: number };
  lowStock: Product[];
  recentOrders: Order[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  weeks: { week: string; revenue: number; orders: number }[];
}
export interface Report {
  range: { start: string; end: string };
  summary: Summary;
  products: {
    sku: string;
    name: string;
    quantity: number;
    revenue: number;
    cost?: number;
    profit?: number;
    margin?: number;
  }[];
  customers: {
    id: number;
    name: string;
    orders: number;
    revenue: number;
    collected: number;
    outstanding: number;
  }[];
  weeks: { week: string; revenue: number; cost?: number; profit?: number; orders: number }[];
  orders: Order[];
}
export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  is_read: number;
  created_at: string;
}
