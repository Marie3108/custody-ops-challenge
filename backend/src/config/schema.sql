
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'OPERATOR', 'VIEWER') NOT NULL,
  password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('RETAIL', 'INSTITUTIONAL') NOT NULL,
  country CHAR(2) NOT NULL,
  kyc_status ENUM('APPROVED', 'PENDING', 'EXPIRED', 'REJECTED') NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  relationship_manager_id INT,
  onboarded_on DATE,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_clients_manager
    FOREIGN KEY (relationship_manager_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS portfolios (
  id VARCHAR(20) PRIMARY KEY,
  client_id VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  base_currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status ENUM('ACTIVE', 'CLOSED') NOT NULL,
  CONSTRAINT fk_portfolios_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS instruments (
  isin VARCHAR(12) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('EQUITY', 'BOND', 'FUND') NOT NULL,
  currency CHAR(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(30) PRIMARY KEY,
  external_ref VARCHAR(255) UNIQUE,
  client_id VARCHAR(20) NOT NULL,
  portfolio_id VARCHAR(20) NOT NULL,
  isin VARCHAR(12) NOT NULL,
  type ENUM('BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT') NOT NULL,
  trade_date DATE NOT NULL,
  settlement_date DATE NOT NULL,
  quantity DECIMAL(20,6) NOT NULL,
  price DECIMAL(20,6) NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('PENDING', 'SETTLED', 'CANCELLED', 'FAILED') NOT NULL,
  INDEX idx_transactions_client_date (client_id, settlement_date),
  INDEX idx_transactions_status_date (status, settlement_date),
  INDEX idx_transactions_portfolio (portfolio_id),
  CONSTRAINT fk_transactions_client
    FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_transactions_portfolio
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
  CONSTRAINT fk_transactions_instrument
    FOREIGN KEY (isin) REFERENCES instruments(isin)
    
);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id VARCHAR(20) NOT NULL,
  invoice_month DATE NOT NULL,
  status ENUM('DRAFT', 'ISSUED', 'PAID', 'VOID')
    NOT NULL DEFAULT 'DRAFT',
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_at TIMESTAMP NULL,
  paid_at TIMESTAMP NULL,
  voided_at TIMESTAMP NULL,
  CONSTRAINT fk_invoices_client
    FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_invoices_creator
    FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_invoices_client_month (client_id, invoice_month),
  INDEX idx_invoices_status (status)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(12,4) NOT NULL DEFAULT 1.0000,
  unit_price DECIMAL(12,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_invoice_lines_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    ON DELETE CASCADE,
  INDEX idx_invoice_lines_invoice (invoice_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type ENUM('CLIENT', 'TRANSACTION', 'INVOICE') NOT NULL,
  entity_id VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  changed_by INT NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_values JSON NULL,
  new_values JSON NULL,
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (changed_by) REFERENCES users(id),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_changed_at (changed_at)
);
