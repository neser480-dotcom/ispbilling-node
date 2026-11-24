-- SMS module (company-scoped). Run once in phpMyAdmin on the `ispbilling` database.
CREATE TABLE IF NOT EXISTS sms_balances (
  company_id INT NOT NULL,
  type ENUM('non_masking','masking','fixed','voice') NOT NULL,
  balance INT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sms_prices (
  type ENUM('non_masking','masking','fixed','voice') PRIMARY KEY,
  unit_price DECIMAL(10,4) NOT NULL DEFAULT 0.40
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO sms_prices (type, unit_price) VALUES
 ('non_masking',0.40),('masking',0.50),('fixed',0.30),('voice',0.60);

CREATE TABLE IF NOT EXISTS sms_templates (
  company_id INT NOT NULL,
  event_key VARCHAR(40) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  message_type ENUM('text','voice') NOT NULL DEFAULT 'text',
  send_type ENUM('non_masking','masking','fixed') NOT NULL DEFAULT 'non_masking',
  title VARCHAR(120) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, event_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- New log (the old `sms_logs` table is left untouched)
CREATE TABLE IF NOT EXISTS sms_message_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  customer_id INT NULL,
  channel ENUM('non_masking','masking','fixed','voice') NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  status ENUM('sent','failed','pending') NOT NULL DEFAULT 'pending',
  kind VARCHAR(30) NOT NULL DEFAULT 'bulk',
  sms_count INT NOT NULL DEFAULT 1,
  attempt INT NOT NULL DEFAULT 1,
  duration INT NULL,
  message TEXT,
  error VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_co_ch (company_id, channel, id),
  INDEX idx_mobile (mobile)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sms_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  type ENUM('non_masking','masking','fixed','voice') NOT NULL,
  sms_count INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  payment_ref VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL,
  INDEX idx_co (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
