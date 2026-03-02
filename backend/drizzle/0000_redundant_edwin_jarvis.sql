CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmark" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"vnum" integer NOT NULL,
	"seller_name" text NOT NULL,
	"item_name" text NOT NULL,
	"server_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_item_price_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_item_price_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"vnum" integer NOT NULL,
	"server_id" integer NOT NULL,
	"avg_price" real DEFAULT 0 NOT NULL,
	"min_price" real DEFAULT 0 NOT NULL,
	"max_price" real DEFAULT 0 NOT NULL,
	"total_listings" integer DEFAULT 0 NOT NULL,
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_server" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"last_fetched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"vnum" integer NOT NULL,
	"server_id" integer NOT NULL,
	"item_name" text NOT NULL,
	"price_threshold" real NOT NULL,
	"direction" text DEFAULT 'below' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_item_price_history" ADD CONSTRAINT "market_item_price_history_server_id_market_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."market_server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_server_id_market_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."market_server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookmark_user_id_idx" ON "bookmark" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookmark_vnum_seller_idx" ON "bookmark" USING btree ("user_id","vnum","seller_name");--> statement-breakpoint
CREATE INDEX "price_history_vnum_idx" ON "market_item_price_history" USING btree ("vnum");--> statement-breakpoint
CREATE INDEX "price_history_server_id_idx" ON "market_item_price_history" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "price_history_fetched_at_idx" ON "market_item_price_history" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "price_history_vnum_server_idx" ON "market_item_price_history" USING btree ("vnum","server_id");--> statement-breakpoint
CREATE INDEX "price_history_vnum_server_fetched_idx" ON "market_item_price_history" USING btree ("vnum","server_id","fetched_at");--> statement-breakpoint
CREATE INDEX "message_user_id_idx" ON "message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_user_read_idx" ON "message" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "price_alert_user_id_idx" ON "price_alert" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "price_alert_vnum_server_idx" ON "price_alert" USING btree ("vnum","server_id");--> statement-breakpoint
CREATE INDEX "price_alert_active_idx" ON "price_alert" USING btree ("active");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");