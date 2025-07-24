INSERT INTO physicians (name, title, specialty, signature_url) VALUES 
('Dr. Sarah Johnson', 'MD', 'Radiologist', '/signatures/sarah-johnson.png'),
('Dr. Michael Chen', 'MD', 'Radiologist', '/signatures/michael-chen.png'),
('Dr. Emily Rodriguez', 'MD', 'Radiologist', '/signatures/emily-rodriguez.png')
ON CONFLICT DO NOTHING;
