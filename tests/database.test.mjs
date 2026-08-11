import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("migration and an atomic sale ledger execute on PostgreSQL", async () => {
  const db = new PGlite();
  const migration = await readFile(new URL("../drizzle/0000_happy_mister_fear.sql", import.meta.url), "utf8");
  await db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  await db.exec(`
    INSERT INTO employees(name,email,role,password_hash) VALUES ('Owner','owner@example.com','Owner','test');
    INSERT INTO products(name,sku,category,price,cost,stock) VALUES ('Coffee','COF-1','Coffee',4.50,1.00,5);
    INSERT INTO register_shifts(register_code,employee_name,opening_float,expected_cash) VALUES ('REG-01','Owner',100,100);
  `);
  await db.transaction(async tx => {
    await tx.exec(`INSERT INTO sales(receipt_number,idempotency_key,shift_id,employee_name,subtotal,tax,total) VALUES ('AT-1','idem-1',1,'Owner',4.50,0.37,4.87)`);
    await tx.exec(`INSERT INTO sale_lines(sale_id,product_id,product_name,sku,unit_price,unit_cost,quantity,line_total) VALUES (1,1,'Coffee','COF-1',4.50,1.00,1,4.50)`);
    await tx.exec(`INSERT INTO payments(sale_id,method,amount,tendered) VALUES (1,'Cash',4.87,5.00)`);
    await tx.exec(`INSERT INTO inventory_movements(product_id,sale_id,type,quantity,reason) VALUES (1,1,'sale',-1,'AT-1')`);
    await tx.exec(`UPDATE products SET stock=stock-1 WHERE id=1 AND stock>=1`);
    await tx.exec(`UPDATE register_shifts SET expected_cash=expected_cash+4.87 WHERE id=1`);
  });
  const result = await db.query(`SELECT p.stock, s.total, r.expected_cash FROM products p CROSS JOIN sales s CROSS JOIN register_shifts r`);
  assert.equal(result.rows[0].stock, 4);
  assert.equal(Number(result.rows[0].total), 4.87);
  assert.equal(Number(result.rows[0].expected_cash), 104.87);
  await db.close();
});
