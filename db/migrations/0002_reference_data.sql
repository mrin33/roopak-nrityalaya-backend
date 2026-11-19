-- 0002 reference data: the 8 Kathak levels and the default fee structure.
-- Idempotent and non-destructive: existing rows are never modified.

INSERT INTO public.levels (level_name, level_number, level_code, description) VALUES
  ('Praveshika Pratham', 1, 'PP', 'Beginner level - Introduction to Kathak'),
  ('Praveshika Purna',   2, 'PM', 'Elementary level completion'),
  ('Madhyama Pratham',   3, 'MP', 'Intermediate level - Part 1'),
  ('Madhyama Purna',     4, 'MM', 'Intermediate level - Part 2'),
  ('Visharad Pratham',   5, 'VP', 'Advanced level - Part 1'),
  ('Visharad Purna',     6, 'VM', 'Advanced level - Part 2'),
  ('Alankar Pratham',    7, 'AP', 'Expert level - Part 1'),
  ('Alankar Purna',      8, 'AM', 'Expert level - Part 2')
ON CONFLICT DO NOTHING;

INSERT INTO public.fee_structure
  (level_id, payment_window, base_amount, discount_percentage, discounted_amount, late_fee_amount, grace_period_days)
SELECT l.level_id, v.payment_window, v.base_amount, v.discount_percentage, v.discounted_amount, v.late_fee_amount, 10
FROM (VALUES
  ('PP', 'monthly',      1000.00,  0.00,  1000.00, 100.00),
  ('PM', 'monthly',      1200.00,  0.00,  1200.00, 100.00),
  ('MP', 'monthly',      1500.00,  0.00,  1500.00, 150.00),
  ('MM', 'monthly',      1500.00,  0.00,  1500.00, 150.00),
  ('VP', 'monthly',      2000.00,  0.00,  2000.00, 200.00),
  ('VM', 'monthly',      2000.00,  0.00,  2000.00, 200.00),
  ('AP', 'monthly',      2500.00,  0.00,  2500.00, 250.00),
  ('AM', 'monthly',      2500.00,  0.00,  2500.00, 250.00),
  ('PP', 'quarterly',    3000.00,  2.00,  2940.00, 100.00),
  ('PM', 'quarterly',    3600.00,  2.00,  3528.00, 100.00),
  ('MP', 'quarterly',    4500.00,  2.00,  4410.00, 150.00),
  ('PP', 'half_yearly',  6000.00,  5.00,  5700.00, 100.00),
  ('PM', 'half_yearly',  7200.00,  5.00,  6840.00, 100.00),
  ('MP', 'half_yearly',  9000.00,  5.00,  8550.00, 150.00),
  ('PP', 'yearly',      12000.00, 10.00, 10800.00, 100.00),
  ('PM', 'yearly',      14400.00, 10.00, 12960.00, 100.00),
  ('MP', 'yearly',      18000.00, 10.00, 16200.00, 150.00)
) AS v(level_code, payment_window, base_amount, discount_percentage, discounted_amount, late_fee_amount)
JOIN public.levels l ON l.level_code = v.level_code
ON CONFLICT (level_id, payment_window) DO NOTHING;
