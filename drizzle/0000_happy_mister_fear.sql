CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_drawer_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" integer NOT NULL,
	"sale_id" integer,
	"type" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" text NOT NULL,
	"employee_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"visits" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(14, 2) DEFAULT 0 NOT NULL,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"sale_id" integer,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tendered" numeric(14, 2),
	"change_due" numeric(14, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"category" text NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"barcode" text,
	"stock" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 8 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "register_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"register_code" text NOT NULL,
	"employee_id" integer,
	"employee_name" text NOT NULL,
	"opening_float" numeric(14, 2) NOT NULL,
	"expected_cash" numeric(14, 2) NOT NULL,
	"counted_cash" numeric(14, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "return_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"sale_line_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"restock" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"receipt_number" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tax" numeric(14, 2) NOT NULL,
	"method" text NOT NULL,
	"reason" text NOT NULL,
	"employee_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"sku" text NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"quantity" integer NOT NULL,
	"returned_quantity" integer DEFAULT 0 NOT NULL,
	"line_total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_number" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"shift_id" integer,
	"employee_id" integer,
	"employee_name" text NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"tax" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"refunded_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"customer_id" integer,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_shift_id_register_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."register_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_register_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."register_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_email_uidx" ON "employees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "inventory_product_idx" ON "inventory_movements" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_uidx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_uidx" ON "products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "shifts_status_idx" ON "register_shifts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "returns_receipt_uidx" ON "returns" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_receipt_uidx" ON "sales" USING btree ("receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_idempotency_uidx" ON "sales" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "sales_created_idx" ON "sales" USING btree ("created_at");