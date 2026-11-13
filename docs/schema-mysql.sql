CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 36d7ee7db9ed

CREATE TABLE basket (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    name VARCHAR(255) NOT NULL, 
    PRIMARY KEY (id)
);

CREATE TABLE product (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    name VARCHAR(255) NOT NULL, 
    brand VARCHAR(255), 
    category VARCHAR(255), 
    unit VARCHAR(30), 
    tags JSON, 
    attributes JSON, 
    aliases JSON, 
    merged_into_id INTEGER, 
    merge_history JSON, 
    PRIMARY KEY (id), 
    FOREIGN KEY(merged_into_id) REFERENCES product (id)
);

CREATE TABLE purchase (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    purchased_at VARCHAR(10) NOT NULL, 
    merchant VARCHAR(255), 
    branch VARCHAR(255), 
    city VARCHAR(255), 
    postal_code VARCHAR(30), 
    country VARCHAR(2), 
    channel VARCHAR(20), 
    currency VARCHAR(3), 
    status VARCHAR(20), 
    receipt_total NUMERIC(36, 12), 
    notes TEXT, 
    created_at VARCHAR(40), 
    fingerprint VARCHAR(64) NOT NULL, 
    PRIMARY KEY (id)
);

CREATE INDEX ix_purchase_fingerprint ON purchase (fingerprint);

CREATE TABLE setting (
    `key` VARCHAR(100) NOT NULL, 
    value JSON NOT NULL, 
    PRIMARY KEY (`key`)
);

CREATE TABLE user (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    username VARCHAR(255) NOT NULL, 
    password_hash VARCHAR(255) NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (username)
);

CREATE TABLE basket_item (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    basket_id INTEGER NOT NULL, 
    product_id INTEGER NOT NULL, 
    quantity NUMERIC(36, 12) NOT NULL, 
    unit VARCHAR(30) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(basket_id) REFERENCES basket (id), 
    FOREIGN KEY(product_id) REFERENCES product (id)
);

CREATE TABLE purchase_item (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    purchase_id INTEGER NOT NULL, 
    product_id INTEGER, 
    product_snapshot JSON, 
    raw_name VARCHAR(255), 
    quantity NUMERIC(36, 12) NOT NULL, 
    package_size NUMERIC(36, 12), 
    unit VARCHAR(30) NOT NULL, 
    line_total NUMERIC(36, 12) NOT NULL, 
    discount NUMERIC(36, 12), 
    deposit NUMERIC(36, 12), 
    is_offer BOOL, 
    is_return BOOL, 
    attributes JSON, 
    normalized_quantity NUMERIC(36, 12), 
    normalized_unit VARCHAR(30), 
    comparison_price NUMERIC(36, 12), 
    comparison_unit VARCHAR(30), 
    calculation_status VARCHAR(80), 
    PRIMARY KEY (id), 
    FOREIGN KEY(product_id) REFERENCES product (id), 
    FOREIGN KEY(purchase_id) REFERENCES purchase (id)
);

INSERT INTO alembic_version (version_num) VALUES ('36d7ee7db9ed');

-- Running upgrade 36d7ee7db9ed -> 3a6ccaac11f2

CREATE TABLE audit_log (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    action VARCHAR(30) NOT NULL, 
    entity VARCHAR(30) NOT NULL, 
    entity_id INTEGER NOT NULL, 
    `before` JSON, 
    after JSON, 
    created_at VARCHAR(40), 
    PRIMARY KEY (id)
);

UPDATE alembic_version SET version_num='3a6ccaac11f2' WHERE alembic_version.version_num = '36d7ee7db9ed';

