-- Point catalog at Razorpay LIVE plan IDs (recreated after switching from test keys).
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TGaZShgGee2USr', updated_at = now() WHERE id = 'identity';
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TGaZT3LRfjGLgC', updated_at = now() WHERE id = 'essential';
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TGaZTJfF2XLTfh', updated_at = now() WHERE id = 'growth';
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TGaZTXHFk6pYCx', updated_at = now() WHERE id = 'storage_addon';
