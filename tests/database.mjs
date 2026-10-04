import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
for (const name of (await readdir("supabase/migrations")).sort()) {
  await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  console.log("Migración OK:", name);
}
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
await db.query(`insert into auth.users values ($1,$2),($3,$4)`, [
  A,
  JSON.stringify({
    empresa: "Empresa A",
    nombre: "Ana",
    identificacion: "1710034065",
    consentimiento: true,
    version_terminos: "2026-10-04",
    version_privacidad: "2026-10-04",
    rol: "CAJERO",
    plan: "inicial",
  }),
  B,
  JSON.stringify({
    empresa: "Empresa B",
    nombre: "Beto",
    identificacion: "1790016919001",
    consentimiento: true,
    version_terminos: "2026-10-04",
    version_privacidad: "2026-10-04",
  }),
]);
const tenants = (
  await db.query(
    `select id,tenant_id,rol from public.usuarios_perfiles order by id`,
  )
).rows;
const ta = tenants[0].tenant_id,
  tb = tenants[1].tenant_id;
assert.notEqual(ta, tb);
assert.equal(tenants[0].rol, "ADMIN");
assert.equal(
  (await db.query("select count(*) n from public.consentimientos_legales")).rows[0].n,
  2,
);
assert.equal(
  Number(
    (
      await db.query(
        `select extract(epoch from(fin-inicio)) s from public.suscripciones where tenant_id=$1`,
        [ta],
      )
    ).rows[0].s,
  ),
  604800,
);
async function user(id) {
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
  await db.exec("set role authenticated");
}
async function owner() {
  await db.exec("reset role");
}
async function rejects(sql, args = []) {
  await assert.rejects(() => db.query(sql, args));
}
await user(A);
assert.equal((await db.query("select * from public.empresas")).rows.length, 1);
assert.equal((await db.query("select * from public.consentimientos_legales")).rows.length, 1);
assert.equal(
  (await db.query("select * from public.usuarios_perfiles")).rows.length,
  1,
);
await rejects(`update public.usuarios_perfiles set rol='ADMIN'`);
await rejects(`update public.suscripciones set estado='active',plan='luxury'`);
await rejects(
  `insert into public.clientes(tenant_id,tipo_id,identificacion,nombre) values($1,'05','0912345678','Ajeno')`,
  [tb],
);
const cid = (await db.query("select id from public.clientes")).rows[0].id;
const prod = (
  await db.query(
    `insert into public.catalogo_maquinaria(tenant_id,codigo,nombre,tipo,precio,iva,stock) values($1,'P1','Producto','PRODUCTO',100,15,3) returning id`,
    [ta],
  )
).rows[0].id;
await rejects(
  `insert into public.catalogo_maquinaria(tenant_id,codigo,nombre,tipo,precio,iva) values($1,'BAD','NaN','SERVICIO','NaN',15)`,
  [ta],
);
const token = "33333333-3333-4333-8333-333333333333";
const invoice = (
  await db.query(`select public.crear_factura($1,$2,$3) id`, [
    cid,
    JSON.stringify([
      { id: prod, cantidad: 1, descuento: 10, precio: 0, iva: 0 },
    ]),
    token,
  ])
).rows[0].id;
const row = (
  await db.query("select * from public.facturas_sri where id=$1", [invoice])
).rows[0];
assert.equal(Number(row.total), 103.5);
assert.equal(Number(row.subtotal_15), 90);
assert.equal(Number(row.iva_15), 13.5);
assert.equal(
  (
    await db.query("select public.crear_factura($1,$2,$3) id", [
      cid,
      JSON.stringify([
        { id: prod, cantidad: 1, descuento: 10, precio: 0, iva: 0 },
      ]),
      token,
    ])
  ).rows[0].id,
  invoice,
);
assert.equal(
  Number(
    (
      await db.query(
        "select stock from public.catalogo_maquinaria where id=$1",
        [prod],
      )
    ).rows[0].stock,
  ),
  2,
);
await rejects("select public.crear_factura($1,$2,$3)", [
  cid,
  JSON.stringify([{ id: prod, cantidad: 2, descuento: 10 }]),
  token,
]);
await rejects(
  `update public.facturas_sri set estado='Autorizada' where id=$1`,
  [invoice],
);
const quota = (
  await db.query("select id from public.cuotas where factura_id=$1", [invoice])
).rows[0].id;
const payment = "44444444-4444-4444-8444-444444444444";
await db.query("select public.registrar_abono($1,50,'01',$2)", [
  quota,
  payment,
]);
await db.query("select public.registrar_abono($1,50,'01',$2)", [
  quota,
  payment,
]);
assert.equal(
  (await db.query("select count(*) n from public.movimientos_caja")).rows[0].n,
  1,
);
await rejects("select public.registrar_abono($1,100,'01',gen_random_uuid())", [
  quota,
]);
await db.query(
  `select public.cerrar_caja((now() at time zone 'America/Guayaquil')::date,49)`,
);
assert.equal(
  (await db.query("select estado from public.cierres_caja")).rows[0].estado,
  "descuadre",
);
await rejects(
  `select public.registrar_gasto(5,'01','Materiales','Compra',gen_random_uuid())`,
);
await user(B);
assert.equal(
  (await db.query("select * from public.facturas_sri")).rows.length,
  0,
);
await rejects("select public.crear_factura($1,$2,gen_random_uuid())", [
  cid,
  JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
]);
await user(A);
await rejects(
  `insert into storage.objects(bucket_id,name) values('certificados',$1)`,
  [tb + "/firma.p12"],
);
await db.query(
  `insert into storage.objects(bucket_id,name) values('certificados',$1)`,
  [ta + "/firma.p12"],
);
await owner();
await db.query(
  `update public.suscripciones set estado='active',plan='inicial' where tenant_id=$1`,
  [ta],
);
await user(A);
assert.equal(
  (await db.query("select * from public.catalogo_maquinaria")).rows.length,
  1,
);
assert.equal(
  (await db.query("select * from public.movimientos_caja")).rows.length,
  0,
);
await rejects(`select public.cerrar_caja(current_date,0)`);
await owner();
await db.query(
  `update public.suscripciones set inicio=now()-interval '8 days',fin=now()-interval '1 day' where tenant_id=$1`,
  [ta],
);
await user(A);
assert.equal(
  (await db.query("select * from public.catalogo_maquinaria")).rows.length,
  0,
);
const access = (await db.query("select public.mi_acceso() a")).rows[0].a;
assert.equal(access.funciones.facturacion, false);
await rejects("select public.crear_factura($1,$2,gen_random_uuid())", [
  cid,
  JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
]);
await owner();
await rejects("insert into auth.users values(gen_random_uuid(),$1)", [
  JSON.stringify({
    empresa: "Repetida",
    identificacion: "1710034065001",
    consentimiento: true,
    version_terminos: "2026-10-04",
    version_privacidad: "2026-10-04",
  }),
]);
await owner();
const order = (
  await db.query(
    `insert into public.pedidos_planes(tenant_id,usuario_id,plan,token,client_tx,base_centavos,iva_centavos,total_centavos,modo) values($1,$2,'pro',gen_random_uuid(),'test-order',1000,150,1150,'payphone') returning id`,
    [ta, A],
  )
).rows[0].id;
await user(A);
await rejects("select public.confirmar_pago_plan($1,123,1150,'USD')", [order]);
await owner();
await rejects("select public.confirmar_pago_plan($1,123,1,'USD')", [order]);
await db.query("select public.confirmar_pago_plan($1,123,1150,'USD')", [order]);
const first = (
  await db.query("select fin from public.suscripciones where tenant_id=$1", [
    ta,
  ])
).rows[0].fin;
await db.query("select public.confirmar_pago_plan($1,123,1150,'USD')", [order]);
assert.deepEqual(
  (
    await db.query("select fin from public.suscripciones where tenant_id=$1", [
      ta,
    ])
  ).rows[0].fin,
  first,
);
await user(A);
assert.equal(
  (await db.query("select public.mi_acceso() a")).rows[0].a.funciones.alquiler,
  true,
);
await user(B);
assert.equal(
  (await db.query("select * from public.pedidos_planes")).rows.length,
  0,
);
const C = "33333333-3333-4333-8333-333333333334";
await owner();
await db.query("insert into auth.users values($1,$2)", [C, JSON.stringify({})]);
await user(C);
await rejects(
  "select public.crear_mi_empresa('OAuth sin aceptación','0999999999001','Cami',true)",
);
await rejects(
  "select public.crear_mi_empresa('OAuth sin aceptación','0999999999001','Cami',false,'2026-10-04','2026-10-04')",
);
await db.query(
  "select public.crear_mi_empresa('Empresa C','0999999999001','Cami',true,'2026-10-04','2026-10-04')",
);
assert.equal(
  (await db.query("select * from public.consentimientos_legales")).rows.length,
  1,
);
await db.close();
console.log(
  "PASS: SQL ejecutado en PostgreSQL WASM; RLS, trigger, aislamiento, privilegios, finanzas, stock, idempotencia, storage y vencimiento.",
);
