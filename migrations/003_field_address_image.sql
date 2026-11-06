-- Maydon manzili va rasmi: Nurobod, Ibrohim Ota qishlog'i + 7x7 maydon chizmasi
-- npx wrangler d1 execute football-booking --local --file=./migrations/003_field_address_image.sql

UPDATE fields
SET address = 'Nurobod tumani, Ibrohim Ota qishlog‘i',
    image_url = '/field-7x7.svg'
WHERE is_active = 1;
