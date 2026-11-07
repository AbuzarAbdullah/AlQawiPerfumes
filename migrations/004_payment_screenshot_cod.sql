-- v2.3: add COD + payment screenshot to the manual-UPI flow.
-- Screenshot is stored as a base64 data URL on the payment row.
-- shortcut: data URL in TEXT (≤512KB enforced in the API), swap for R2 if volume grows.
ALTER TABLE payments ADD COLUMN screenshot_data TEXT;
