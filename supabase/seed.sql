-- ROADLIVE Seed Data: Novosibirsk
-- Safe re-run seed script for local testing and demo

DO $$
DECLARE
    city_nsk UUID := '11111111-1111-1111-1111-111111111111';
    d_lenin UUID := '22222222-1111-1111-1111-111111111111';
    d_oct UUID := '22222222-2222-1111-1111-111111111111';
    d_cent UUID := '22222222-3333-1111-1111-111111111111';
    d_kirov UUID := '22222222-4444-1111-1111-111111111111';
    d_dzerzh UUID := '22222222-5555-1111-1111-111111111111';
    d_zael UUID := '22222222-6666-1111-1111-111111111111';
    d_kalin UUID := '22222222-7777-1111-1111-111111111111';
    d_pervom UUID := '22222222-8888-1111-1111-111111111111';
    d_soviet UUID := '22222222-9999-1111-1111-111111111111';
    d_zheldor UUID := '22222222-aaaa-1111-1111-111111111111';

    u_admin UUID := '33333333-0000-1111-1111-111111111111';
    u_driver1 UUID := '33333333-1111-1111-1111-111111111111';
    u_driver2 UUID := '33333333-2222-1111-1111-111111111111';
    u_driver3 UUID := '33333333-3333-1111-1111-111111111111';
    u_driver4 UUID := '33333333-4444-1111-1111-111111111111';
    u_driver5 UUID := '33333333-5555-1111-1111-111111111111';
BEGIN
    -- 1. City
    INSERT INTO cities (id, name, latitude, longitude, default_zoom)
    VALUES (city_nsk, 'Новосибирск', 55.0084, 82.9357, 12)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    -- 2. Districts of Novosibirsk
    INSERT INTO districts (id, city_id, name, slug, center_lat, center_lng)
    VALUES 
      (d_lenin, city_nsk, 'Ленинский район', 'leninskiy', 54.9833, 82.8667),
      (d_oct, city_nsk, 'Октябрьский район', 'oktyabrskiy', 55.0167, 82.9833),
      (d_cent, city_nsk, 'Центральный район', 'tsentralniy', 55.0333, 82.9167),
      (d_kirov, city_nsk, 'Кировский район', 'kirovskiy', 54.9500, 82.9167),
      (d_dzerzh, city_nsk, 'Дзержинский район', 'dzerzhinskiy', 55.0500, 83.0000),
      (d_zael, city_nsk, 'Заельцовский район', 'zaeltsovskiy', 55.0667, 82.8833),
      (d_kalin, city_nsk, 'Калининский район', 'kalininskiy', 55.0833, 82.9500),
      (d_pervom, city_nsk, 'Первомайский район', 'pervomayskiy', 54.9667, 83.0667),
      (d_soviet, city_nsk, 'Советский район (Академгородок)', 'sovetskiy', 54.8500, 83.1000),
      (d_zheldor, city_nsk, 'Железнодорожный район', 'zheleznodorozhniy', 55.0333, 82.8833)
    ON CONFLICT (id) DO NOTHING;

    -- 3. Profiles (Test Accounts & Community Drivers)
    INSERT INTO profiles (id, email, full_name, role, level, rating, helpful_confirmations_count, events_count, questions_count, answers_count)
    VALUES
      (u_admin, 'admin@example.com', 'Алексей (Администратор)', 'admin', 'Эксперт района', 5.0, 312, 145, 42, 189),
      (u_driver1, 'driver1@example.com', 'Дмитрий Соколов', 'driver', 'Активный водитель', 4.9, 247, 82, 31, 104),
      (u_driver2, 'driver2@example.com', 'Максим Власов', 'driver', 'Водитель', 4.8, 114, 45, 18, 56),
      (u_driver3, 'andrey_nsk@example.com', 'Андрей К.', 'driver', 'Эксперт района', 4.95, 420, 118, 60, 210),
      (u_driver4, 'sergey_nsk@example.com', 'Сергей Петров', 'driver', 'Наблюдатель', 4.7, 88, 29, 12, 40),
      (u_driver5, 'elena_auto@example.com', 'Елена Романова', 'driver', 'Водитель', 4.85, 96, 34, 15, 62)
    ON CONFLICT (id) DO NOTHING;

    -- 4. Fuel Stations (АЗС)
    INSERT INTO stations (id, city_id, name, brand, latitude, longitude, address, queue_status)
    VALUES
      (uuid_generate_v4(), city_nsk, 'Газпромнефть №42', 'Газпромнефть', 55.0125, 82.9510, 'ул. Большевистская, 125', 'none'),
      (uuid_generate_v4(), city_nsk, 'Лукойл АЗС-14', 'Лукойл', 55.0450, 82.9150, 'Красный проспект, 182/1', 'small'),
      (uuid_generate_v4(), city_nsk, 'Роснефть', 'Роснефть', 54.9810, 82.8720, 'ул. Станционная, 38', 'large'),
      (uuid_generate_v4(), city_nsk, 'Прайм Ойл', 'Прайм', 55.0290, 82.8870, 'ул. Фабричная, 10', 'none'),
      (uuid_generate_v4(), city_nsk, 'Газпромнефть №11', 'Газпромнефть', 54.9600, 82.9250, 'ул. Немировича-Данченко, 146', 'none'),
      (uuid_generate_v4(), city_nsk, 'Татнефть', 'Татнефть', 55.0680, 82.9300, 'ул. Дуси Ковальчук, 260', 'small')
    ON CONFLICT DO NOTHING;

END $$;
