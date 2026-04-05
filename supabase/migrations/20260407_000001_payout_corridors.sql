-- Office-managed payout corridors (bank transfer + mobile money). Currency is derived from country rail row.
CREATE TABLE public.payout_corridors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rail text NOT NULL CHECK (rail IN ('bank_transfer', 'mobile_money')),
  country_code char(2) NOT NULL CHECK (country_code = upper(country_code)),
  country_name text NOT NULL,
  currency_code char(3) NOT NULL CHECK (currency_code = upper(currency_code)),
  currency_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer,
  providers jsonb,
  settlement_backend text,
  metadata jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX payout_corridors_rail_country_key ON public.payout_corridors (rail, country_code);
CREATE INDEX payout_corridors_enabled_rail_idx ON public.payout_corridors (enabled, rail, sort_order);

COMMENT ON TABLE public.payout_corridors IS 'Per-country payout catalog: country-first; currency comes from row. Public API returns enabled rows only.';

CREATE OR REPLACE FUNCTION public.payout_corridors_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payout_corridors_updated_at
  BEFORE UPDATE ON public.payout_corridors
  FOR EACH ROW
  EXECUTE PROCEDURE public.payout_corridors_set_updated_at();

ALTER TABLE public.payout_corridors ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_corridors_select_enabled_authenticated
  ON public.payout_corridors
  FOR SELECT
  TO authenticated
  USING (enabled = true);

GRANT SELECT ON public.payout_corridors TO authenticated;

-- service_role bypasses RLS for admin API routes

-- Seed: settlement_backend NULL (optional ops hint; set in office if needed). providers = MM UI allow-list, not Noah-specific.
INSERT INTO public.payout_corridors (rail, country_code, country_name, currency_code, currency_name, enabled, sort_order, providers, settlement_backend, metadata)
VALUES
('bank_transfer','US','United States','USD','US Dollar',true,10,NULL,NULL,NULL),
('bank_transfer','AR','Argentina','ARS','Argentine Peso',true,20,NULL,NULL,NULL),
('bank_transfer','AU','Australia','AUD','Australian Dollar',true,30,NULL,NULL,NULL),
('bank_transfer','AT','Austria','EUR','Euro',true,40,NULL,NULL,NULL),
('bank_transfer','BE','Belgium','EUR','Euro',true,50,NULL,NULL,NULL),
('bank_transfer','BJ','Benin','XOF','West African CFA Franc',true,60,NULL,NULL,NULL),
('bank_transfer','BR','Brazil','BRL','Brazilian Real',true,70,NULL,NULL,NULL),
('bank_transfer','CH','Switzerland','CHF','Swiss Franc',true,80,NULL,NULL,NULL),
('bank_transfer','CL','Chile','CLP','Chilean Peso',true,90,NULL,NULL,NULL),
('bank_transfer','CO','Colombia','COP','Colombian Peso',true,100,NULL,NULL,NULL),
('bank_transfer','CG','Republic of the Congo','XAF','Central African CFA Franc',true,110,NULL,NULL,NULL),
('bank_transfer','CI','Cote D''Ivoire','XOF','West African CFA Franc',true,120,NULL,NULL,NULL),
('bank_transfer','HR','Croatia','EUR','Euro',true,130,NULL,NULL,NULL),
('bank_transfer','CZ','Czech Republic','CZK','Czech Koruna',true,140,NULL,NULL,NULL),
('bank_transfer','DK','Denmark','DKK','Danish Krone',true,150,NULL,NULL,NULL),
('bank_transfer','DO','Dominican Republic','DOP','Dominican Peso',true,160,NULL,NULL,NULL),
('bank_transfer','EC','Ecuador','USD','US Dollar',true,170,NULL,NULL,NULL),
('bank_transfer','EE','Estonia','EUR','Euro',true,180,NULL,NULL,NULL),
('bank_transfer','ET','Ethiopia','ETB','Ethiopian Birr',true,190,NULL,NULL,NULL),
('bank_transfer','FI','Finland','EUR','Euro',true,200,NULL,NULL,NULL),
('bank_transfer','FJ','Fiji','FJD','Fijian Dollar',true,210,NULL,NULL,NULL),
('bank_transfer','FR','France','EUR','Euro',true,220,NULL,NULL,NULL),
('bank_transfer','GA','Gabon','XAF','Central African CFA Franc',true,230,NULL,NULL,NULL),
('bank_transfer','DE','Germany','EUR','Euro',true,240,NULL,NULL,NULL),
('bank_transfer','GH','Ghana','GHS','Ghanaian Cedi',true,250,NULL,NULL,NULL),
('bank_transfer','GR','Greece','EUR','Euro',true,260,NULL,NULL,NULL),
('bank_transfer','HK','Hong Kong','HKD','Hong Kong Dollar',true,270,NULL,NULL,NULL),
('bank_transfer','IN','India','INR','Indian Rupee',true,280,NULL,NULL,NULL),
('bank_transfer','ID','Indonesia','IDR','Indonesian Rupiah',true,290,NULL,NULL,NULL),
('bank_transfer','IE','Ireland','EUR','Euro',true,300,NULL,NULL,NULL),
('bank_transfer','IT','Italy','EUR','Euro',true,310,NULL,NULL,NULL),
('bank_transfer','LV','Latvia','EUR','Euro',true,320,NULL,NULL,NULL),
('bank_transfer','LT','Lithuania','EUR','Euro',true,330,NULL,NULL,NULL),
('bank_transfer','LU','Luxembourg','EUR','Euro',true,340,NULL,NULL,NULL),
('bank_transfer','MW','Malawi','MWK','Malawian Kwacha',true,350,NULL,NULL,NULL),
('bank_transfer','MY','Malaysia','MYR','Malaysian Ringgit',true,360,NULL,NULL,NULL),
('bank_transfer','MX','Mexico','MXN','Mexican Peso',true,370,NULL,NULL,NULL),
('bank_transfer','NL','Netherlands','EUR','Euro',true,380,NULL,NULL,NULL),
('bank_transfer','NZ','New Zealand','NZD','New Zealand Dollar',true,390,NULL,NULL,NULL),
('bank_transfer','NG','Nigeria','NGN','Nigerian Naira',true,400,NULL,NULL,NULL),
('bank_transfer','PH','Philippines','PHP','Philippine Peso',true,410,NULL,NULL,NULL),
('bank_transfer','PL','Poland','PLN','Polish Zloty',true,420,NULL,NULL,NULL),
('bank_transfer','PT','Portugal','EUR','Euro',true,430,NULL,NULL,NULL),
('bank_transfer','PY','Paraguay','PYG','Paraguayan Guarani',true,440,NULL,NULL,NULL),
('bank_transfer','RO','Romania','RON','Romanian Leu',true,450,NULL,NULL,NULL),
('bank_transfer','RW','Rwanda','RWF','Rwandan Franc',true,460,NULL,NULL,NULL),
('bank_transfer','SG','Singapore','SGD','Singapore Dollar',true,470,NULL,NULL,NULL),
('bank_transfer','SL','Sierra Leone','SLL','Sierra Leonean Leone',true,480,NULL,NULL,NULL),
('bank_transfer','SK','Slovakia','EUR','Euro',true,490,NULL,NULL,NULL),
('bank_transfer','SI','Slovenia','EUR','Euro',true,500,NULL,NULL,NULL),
('bank_transfer','KR','South Korea','KRW','South Korean Won',true,510,NULL,NULL,NULL),
('bank_transfer','ES','Spain','EUR','Euro',true,520,NULL,NULL,NULL),
('bank_transfer','SE','Sweden','SEK','Swedish Krona',true,530,NULL,NULL,NULL),
('bank_transfer','TH','Thailand','THB','Thai Baht',true,540,NULL,NULL,NULL),
('bank_transfer','TR','Turkey','TRY','Turkish Lira',true,550,NULL,NULL,NULL),
('bank_transfer','AE','United Arab Emirates','AED','UAE Dirham',true,560,NULL,NULL,NULL),
('bank_transfer','GB','United Kingdom','GBP','British Pound',true,570,NULL,NULL,NULL),
('bank_transfer','UG','Uganda','UGX','Ugandan Shilling',true,580,NULL,NULL,NULL),
('bank_transfer','UY','Uruguay','UYU','Uruguayan Peso',true,590,NULL,NULL,NULL),
('bank_transfer','VU','Vanuatu','VUV','Vanuatu Vatu',true,600,NULL,NULL,NULL),
-- Bank rows for countries that also have mobile_money (same currency per country; rail-specific provider rules apply only to MM).
('bank_transfer','BW','Botswana','BWP','Botswana Pula',true,601,NULL,NULL,NULL),
('bank_transfer','CM','Cameroon','XAF','Central African CFA Franc',true,602,NULL,NULL,NULL),
('bank_transfer','KE','Kenya','KES','Kenyan Shilling',true,603,NULL,NULL,NULL),
('bank_transfer','SN','Senegal','XOF','West African CFA Franc',true,604,NULL,NULL,NULL),
('bank_transfer','TZ','Tanzania','TZS','Tanzanian Shilling',true,605,NULL,NULL,NULL),
('bank_transfer','TG','Togo','XOF','West African CFA Franc',true,606,NULL,NULL,NULL),
('bank_transfer','ZM','Zambia','ZMW','Zambian Kwacha',true,607,NULL,NULL,NULL),
('bank_transfer','BF','Burkina Faso','XOF','West African CFA Franc',true,608,NULL,NULL,NULL),
('bank_transfer','ML','Mali','XOF','West African CFA Franc',true,609,NULL,NULL,NULL),
('mobile_money','BJ','Benin','XOF','West African CFA Franc',true,610,'["MTN","Moov Money"]'::jsonb,NULL,NULL),
('mobile_money','BW','Botswana','BWP','Botswana Pula',true,620,'["MyZaka"]'::jsonb,NULL,NULL),
('mobile_money','CM','Cameroon','XAF','Central African CFA Franc',true,630,'["MTN","Orange"]'::jsonb,NULL,NULL),
('mobile_money','CI','Ivory Coast','XOF','West African CFA Franc',true,640,'["Moov Money","MTN","Wave"]'::jsonb,NULL,NULL),
('mobile_money','KE','Kenya','KES','Kenyan Shilling',true,650,'["Airtel Money","M-PESA"]'::jsonb,NULL,NULL),
('mobile_money','MW','Malawi','MWK','Malawian Kwacha',true,660,'["Airtel Money","TNM"]'::jsonb,NULL,NULL),
('mobile_money','RW','Rwanda','RWF','Rwandan Franc',true,670,'["MTN"]'::jsonb,NULL,NULL),
('mobile_money','SN','Senegal','XOF','West African CFA Franc',true,680,'["Orange","Wave","Free"]'::jsonb,NULL,NULL),
('mobile_money','TZ','Tanzania','TZS','Tanzanian Shilling',true,690,'["Airtel Money","TigoPesa"]'::jsonb,NULL,NULL),
('mobile_money','TG','Togo','XOF','West African CFA Franc',true,700,'["Moov Money","Togocell"]'::jsonb,NULL,NULL),
('mobile_money','UG','Uganda','UGX','Ugandan Shilling',true,710,'["Airtel Money","MTN"]'::jsonb,NULL,NULL),
('mobile_money','ZM','Zambia','ZMW','Zambian Kwacha',true,720,'["Airtel Money","MTN","TNM"]'::jsonb,NULL,NULL),
('mobile_money','BF','Burkina Faso','XOF','West African CFA Franc',false,730,NULL,NULL,NULL),
('mobile_money','GA','Gabon','XAF','Central African CFA Franc',false,740,NULL,NULL,NULL),
('mobile_money','ML','Mali','XOF','West African CFA Franc',false,750,NULL,NULL,NULL),
('mobile_money','PH','Philippines','PHP','Philippine Peso',true,760,'["GCash","Maya"]'::jsonb,NULL,NULL),
('mobile_money','ID','Indonesia','IDR','Indonesian Rupiah',true,770,'["DANA","OVO","GoPay"]'::jsonb,NULL,NULL),
('mobile_money','IN','India','INR','Indian Rupee',true,780,'["UPI"]'::jsonb,NULL,NULL)
;
