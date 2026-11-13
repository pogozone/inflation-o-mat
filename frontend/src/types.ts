export type Session = {
  authenticated: boolean;
  csrf_token: string;
  setup_required: boolean;
  username: string | null;
};
export type Product = {
  merged_into_id?: number | null;
  id: number;
  name: string;
  brand: string;
  category: string;
  tags: string[];
  attributes: Record<string, unknown>;
  aliases: string[];
  unit: string;
};
export type Item = {
  product_id: number | null;
  raw_name: string;
  quantity: string;
  package_size: string | null;
  unit: string;
  line_total: string;
  discount: string;
  deposit: string;
  is_offer: boolean;
  is_return: boolean;
  attributes: Record<string, unknown>;
};
export type Purchase = {
  id?: number;
  purchased_at: string;
  merchant: string;
  branch: string;
  city: string;
  postal_code: string;
  country: string;
  channel: string;
  currency: string;
  status: string;
  receipt_total: string | null;
  notes: string;
  items: Item[];
};
export type Observation = {
  id: number;
  purchased_at: string;
  product_name: string;
  merchant: string;
  city: string;
  comparison_price: string | null;
  comparison_unit: string | null;
  line_total: string;
  discount: string;
};
export type MetricRow = Record<string, string | number | null>;
export type Analytics = {
  summary: {
    purchase_count: number;
    observation_count: number;
    total_spend: string;
    product_count: number;
  };
  monthly: MetricRow[];
  market_monthly: MetricRow[];
  regions: MetricRow[];
  markets: MetricRow[];
  changes: MetricRow[];
};
export type Basket = {
  id: number;
  name: string;
  items: { product_id: number; quantity: string; unit: string }[];
};
export type Filters = {
  from: string;
  to: string;
  city: string;
  postal_code: string;
  merchant: string;
  product_id: string;
  category: string;
  tag: string;
  include_offers: string;
};
export const units = [
  "g",
  "kg",
  "ml",
  "l",
  "Stück",
  "m",
  "m²",
  "Blatt",
  "Waschladung",
];
