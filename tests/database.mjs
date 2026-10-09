import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);
-- El contrato histórico (uuid) es el que exigen las migraciones previas a la
-- FASE 2: sus funciones SQL y policies comparan 'columna_uuid = auth.uid()' y
-- PostgreSQL valida eso al crearlas. La migración 202610060001_clerk_identidad
-- la sustituye por la versión text (misma lectura de claims, sin cast) justo
-- antes de que arrancen los fixtures y los tests: todo lo que viene a
-- continuación corre ya contra identidad en texto.
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
// El trigger crear_negocio_al_registrarse ya no existe (autenticación Clerk):
// el alta de negocio la hace el frontend con crear_mi_empresa. El bootstrap
// replica a mano lo que creaba ese trigger, con el email que ahora vive en
// usuarios_perfiles (B es el superadmin: su correo es el de la caché de bypass).
await db.query(
  `insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc) values
    ($1,$1,'Empresa A','1710034065','Empresa A',null),
    ($2,$2,'Empresa B','1790016919001','Empresa B','1790016919001')`,
  [A, B],
);
await db.query(
  `insert into public.usuarios_perfiles(id,tenant_id,rol,nombre,email) values
    ($1::text,$1::uuid,'ADMIN','Ana','ana@ejemplo.com'),
    ($2::text,$2::uuid,'ADMIN','Beto','lopeznieto2512@gmail.com')`,
  [A, B],
);
await db.query(
  `insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values
    ($1,'luxury','trial',now(),now()+interval '7 days'),
    ($2,'luxury','trial',now(),now()+interval '7 days')`,
  [A, B],
);
await db.query(
  `insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values
    ($1,'07','9999999999999','CONSUMIDOR FINAL','Ecuador'),
    ($2,'07','9999999999999','CONSUMIDOR FINAL','Ecuador')`,
  [A, B],
);
await db.query(
  `insert into public.consentimientos_legales(usuario_id,tenant_id,version_terminos,version_privacidad,version_encargo,canal) values
    ($1::text,$1::uuid,'2026-10-04','2026-10-04','2026-10-04','registro_email'),
    ($2::text,$2::uuid,'2026-10-04','2026-10-04','2026-10-04','registro_email')`,
  [A, B],
);
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
// Sólo columnas concedidas a authenticated: email/telefono de otros usuarios
// ya no son legibles desde el navegador (minimización LOPDP).
assert.equal(
  (
    await db.query(
      "select id,tenant_id,nombre,rol from public.usuarios_perfiles",
    )
  ).rows.length,
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
// Ya no hay trigger sobre auth.users; el equivalente en el mundo Clerk es que
// quien ya tiene empresa no pueda volver a llamar crear_mi_empresa.
await user(A);
await rejects(
  "select public.crear_mi_empresa('Repetida','1710034065001','Ana',true,'2026-10-04','2026-10-04')",
);
await owner();
// Pedidos y activación con PayPal: la RPC exige service_role, total
// exacto, moneda USD y una referencia de suscripción de tamaño real.
const order = (
  await db.query(
    `insert into public.pedidos_planes(tenant_id,usuario_id,plan,token,client_tx,base_centavos,iva_centavos,total_centavos,modo,payment_id) values($1,$2,'pro',gen_random_uuid(),'test-order',1000,150,1150,'paypal','I-TESTTESTTEST') returning id`,
    [ta, A],
  )
).rows[0].id;
await user(A);
await rejects(
  "select public.confirmar_suscripcion_paypal($1,'I-TESTTESTTEST',1150,'USD')",
  [order],
);
await owner();
await rejects(
  "select public.confirmar_suscripcion_paypal($1,'I-TESTTESTTEST',1,'USD')",
  [order],
);
await rejects(
  "select public.confirmar_suscripcion_paypal($1,'corto',1150,'USD')",
  [order],
);
await db.query(
  "select public.confirmar_suscripcion_paypal($1,'I-TESTTESTTEST',1150,'USD')",
  [order],
);
const activa = (
  await db.query(
    "select estado,plan,paypal_subscription_id,paypal_estado,fin from public.suscripciones where tenant_id=$1",
    [ta],
  )
).rows[0];
assert.equal(activa.estado, "active");
assert.equal(activa.plan, "pro");
assert.equal(activa.paypal_subscription_id, "I-TESTTESTTEST");
assert.equal(activa.paypal_estado, "ACTIVE");
const first = activa.fin;
// Repetir la misma confirmación no añade un mes extra.
await db.query(
  "select public.confirmar_suscripcion_paypal($1,'I-TESTTESTTEST',1150,'USD')",
  [order],
);
assert.deepEqual(
  (
    await db.query("select fin from public.suscripciones where tenant_id=$1", [
      ta,
    ])
  ).rows[0].fin,
  first,
);
// Otra referencia sobre un pedido ya aplicado = rechazo.
await rejects(
  "select public.confirmar_suscripcion_paypal($1,'I-OTRAOTRAOTRA',1150,'USD')",
  [order],
);
// Las tablas de conciliación de PayPal son internas: ningún cliente las ve.
await user(A);
await rejects("select * from public.pagos_paypal_catalogo");
await rejects("select * from public.pagos_paypal_ventas");
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
// C no existe en auth.users ni tiene perfil: es un usuario recién registrado
// en Clerk cuya empresa la crea la propia RPC crear_mi_empresa.
await user(C);
await rejects(
  "select public.crear_mi_empresa('OAuth sin aceptación','0999999999001','Cami',true)",
);
await rejects(
  "select public.crear_mi_empresa('OAuth sin aceptación','0999999999001','Cami',false,'2026-10-04','2026-10-04')",
);
await db.query(
  "select public.crear_mi_empresa('Empresa C','0999999999001','Cami',true,'2026-10-05.1','2026-10-05.2')",
);
assert.equal(
  (await db.query("select * from public.consentimientos_legales")).rows.length,
  1,
);
// El acta guarda las versiones REALES que aceptó el usuario (regresión del
// pin '2026-10-04' que rompió el onboarding de todo usuario nuevo).
{
  const acta = (
    await db.query(
      "select version_terminos vt, version_privacidad vp from public.consentimientos_legales",
    )
  ).rows[0];
  assert.equal(acta.vt, "2026-10-05.1");
  assert.equal(acta.vp, "2026-10-05.2");
}
// --- Vault: la contraseña del .p12 nunca queda en texto plano ---
await user(A);
await db.query(`select public.guardar_p12_password($1)`, [
  "clave-super-secreta",
]);
const secretId = (
  await db.query("select p12_secret_id from public.empresas where id=$1", [ta])
).rows[0].p12_secret_id;
assert.ok(secretId);
// La columna de texto plano ya no existe.
await rejects(`select p12_password from public.empresas`);
// Un usuario autenticado no puede descifrar, invocar la RPC de lectura
// ni reescribir la referencia del secreto.
await rejects(`select decrypted_secret from vault.decrypted_secrets`);
await rejects(`select public.leer_p12_password($1)`, [ta]);
await rejects(
  `update public.empresas set p12_secret_id=gen_random_uuid() where id=$1`,
  [ta],
);
// Rotación: el mismo secreto se reemplaza en su sitio, sin huérfanos.
await db.query(`select public.guardar_p12_password($1)`, ["clave-nueva"]);
assert.equal(
  (
    await db.query("select p12_secret_id from public.empresas where id=$1", [
      ta,
    ])
  ).rows[0].p12_secret_id,
  secretId,
);
await owner();
assert.equal(
  (await db.query("select count(*) n from vault.secrets")).rows[0].n,
  1,
);
// Defensa en profundidad: la RPC exige el claim service_role aunque el
// llamador tenga EXECUTE (el propietario lo tiene).
await db.query(
  `select set_config('request.jwt.claims','{"role":"authenticated"}',false)`,
);
await rejects(`select public.leer_p12_password($1)`, [ta]);
await db.query(
  `select set_config('request.jwt.claims','{"role":"service_role"}',false)`,
);
assert.equal(
  (await db.query(`select public.leer_p12_password($1) p`, [ta])).rows[0].p,
  "clave-nueva",
);
await db.query(`select set_config('request.jwt.claims','',false)`);

// --- Facturación programada: crear y procesar sin sesión (cron) ---
await owner();
await db.query(
  `update public.suscripciones set plan='luxury',estado='active',inicio=now()-interval '1 day',fin=now()+interval '30 days' where tenant_id=$1`,
  [ta],
);
await user(A);
const sched = (
  await db.query(
    `select public.crear_factura_programada($1,$2,'20',0,'mensual',5,0,(now() at time zone 'America/Guayaquil')::date) id`,
    [cid, JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }])],
  )
).rows[0].id;
assert.ok(sched);
// Días que no aplican quedan NULL (los CHECK exigen 1-31 / 0-6 o NULL):
await db.query(
  `select public.crear_factura_programada($1,$2,'01',0,'diaria',0,0,(now() at time zone 'America/Guayaquil')::date + 1)`,
  [cid, JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }])],
);
const nullDays = (
  await db.query(
    `select dia_mes, dia_semana from public.facturas_programadas where periodicidad='diaria' and tenant_id=$1`,
    [ta],
  )
).rows[0];
assert.equal(nullDays.dia_mes, null);
assert.equal(nullDays.dia_semana, null);
// El motor emite sin sesión (como hace el cron) y avanza la próxima fecha:
await owner();
const processed = (
  await db.query(`select public.procesar_facturas_programadas() n`)
).rows[0].n;
assert.equal(processed, 1);
const next = (
  await db.query(
    `select proxima_fecha from public.facturas_programadas where id=$1`,
    [sched],
  )
).rows[0].proxima_fecha;
assert.ok(new Date(next) > new Date());
assert.equal(
  (
    await db.query(
      "select count(*) n from public.facturas_sri where cliente_id=$1",
      [cid],
    )
  ).rows[0].n,
  2,
);
// --- Superadmin: la empresa del dueño tiene todo, incluso vencida ---
await owner();
await db.query(
  `update public.suscripciones set estado='expired',inicio=now()-interval '8 days',fin=now()-interval '1 day' where tenant_id=$1`,
  [tb],
);
await user(B);
const accessB = (await db.query("select public.mi_acceso() a")).rows[0].a;
assert.equal(accessB.superadmin, true);
assert.equal(accessB.funciones.finanzas, true);
// Y puede facturar aunque su suscripción esté vencida:
const cliB = (await db.query("select id from public.clientes")).rows[0].id;
const prodB = (
  await db.query(
    `insert into public.catalogo_maquinaria(tenant_id,codigo,nombre,tipo,precio,iva,stock) values($1,'PB','Producto B','PRODUCTO',10,15,50) returning id`,
    [tb],
  )
).rows[0].id;
await db.query(`select public.crear_factura($1,$2,gen_random_uuid())`, [
  cliB,
  JSON.stringify([{ id: prodB, cantidad: 1, descuento: 0 }]),
]);

// --- Límite de prueba: 10 facturas en trial, ni una más ---
await owner();
await db.query(`update public.catalogo_maquinaria set stock=100 where id=$1`, [
  prod,
]);
await db.query(
  `update public.suscripciones set plan='luxury',estado='trial',inicio=now(),fin=now()+interval '7 days' where tenant_id=$1`,
  [ta],
);
await user(A);
assert.equal(
  (await db.query("select public.mi_acceso() a")).rows[0].a.superadmin,
  false,
);
// A ya tiene 2 facturas; con 8 más llega exactamente a 10:
for (let i = 0; i < 8; i++) {
  await db.query(`select public.crear_factura($1,$2,gen_random_uuid())`, [
    cid,
    JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
  ]);
}
// La número 11 se rechaza:
await rejects(`select public.crear_factura($1,$2,gen_random_uuid())`, [
  cid,
  JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
]);
// Con plan pagado vuelve a emitir sin límite:
await owner();
await db.query(
  `update public.suscripciones set estado='active' where tenant_id=$1`,
  [ta],
);
await user(A);
await db.query(`select public.crear_factura($1,$2,gen_random_uuid())`, [
  cid,
  JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
]);

// --- Proformas: crear, aprobar por link público y facturar en 1 clic ---
const prof = (
  await db.query(`select public.crear_proforma($1,$2,'20',0,15) p`, [
    cid,
    JSON.stringify([{ id: prod, cantidad: 2, descuento: 0 }]),
  ])
).rows[0].p;
assert.ok(prof.id && prof.token && prof.numero >= 1);
const invAntes = Number(
  (
    await db.query("select count(*) n from public.facturas_sri where tenant_id=(select tenant_id from public.proformas where id=$1)", [prof.id])
  ).rows[0].n,
);
// Vista pública anónima (sin sesión): datos suficientes y nada interno.
await db.exec("reset role; set role anon");
const vista = (await db.query(`select public.ver_proforma($1) v`, [prof.token])).rows[0].v;
assert.equal(vista.numero, prof.numero);
assert.equal(vista.estado, "Enviada");
assert.ok(vista.empresa.razon_social && vista.items.length === 1);
// Aprobación pública: genera la factura automáticamente.
const aprob = (await db.query(`select public.aprobar_proforma($1) a`, [prof.token])).rows[0].a;
assert.equal(aprob.estado, "Aprobada");
assert.ok(aprob.factura);
// Idempotente: aprobar de nuevo devuelve la misma factura, no duplica.
const aprob2 = (await db.query(`select public.aprobar_proforma($1) a`, [prof.token])).rows[0].a;
assert.equal(aprob2.factura, aprob.factura);
await owner();
const invDespues = Number(
  (
    await db.query("select count(*) n from public.facturas_sri where tenant_id=(select tenant_id from public.proformas where id=$1)", [prof.id])
  ).rows[0].n,
);
assert.equal(invDespues, invAntes + 1);
// La factura generada tiene los importes de la cotización (2 × 100 + 15% IVA).
const fProf = (
  await db.query("select total from public.facturas_sri where id=$1", [aprob.factura])
).rows[0];
assert.equal(Number(fProf.total), 230);
// Rechazar una ya aprobada no se permite; anular sí funciona sólo en Enviada.
await rejects(`select public.rechazar_proforma($1)`, [prof.token]);
await user(A);
const prof2 = (
  await db.query(`select public.crear_proforma($1,$2,'01',0,10) p`, [
    cid,
    JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
  ])
).rows[0].p;
await db.query(`select public.anular_proforma($1)`, [prof2.id]);
await rejects(`select public.aprobar_proforma($1)`, [prof2.token]);

// --- Eliminar clientes: sin deuda sí; con deuda pendiente, jamás ---
await user(A);
const cliTemp = (
  await db.query(
    `insert into public.clientes(tenant_id,tipo_id,identificacion,nombre) values($1,'05','0912345670','Temporal') returning id`,
    [ta],
  )
).rows[0].id;
await db.query(`select public.eliminar_cliente($1)`, [cliTemp]);
assert.equal(
  (await db.query("select count(*) n from public.clientes where id=$1", [cliTemp])).rows[0].n,
  0,
);
const cliDebe = (
  await db.query(
    `insert into public.clientes(tenant_id,tipo_id,identificacion,nombre) values($1,'05','0923456781','Deudor') returning id`,
    [ta],
  )
).rows[0].id;
await db.query(`select public.crear_factura($1,$2,gen_random_uuid())`, [
  cliDebe,
  JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
]);
// Con cuota pendiente → rechazado; consumidor final → protegido.
await rejects(`select public.eliminar_cliente($1)`, [cliDebe]);
await rejects(`select public.eliminar_cliente($1)`, [cid]);
// 'configuracion' llega en mi_acceso: superadmin la tiene, el resto no.
const confA = (await db.query("select public.mi_acceso() a")).rows[0].a;
assert.equal(confA.funciones.configuracion, false);

// --- Auditoría: cada cambio crítico queda registrado, sin secretos ---
await user(A);
const factId = (
  await db.query(`select public.crear_factura($1,$2,gen_random_uuid())`, [
    cid,
    JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
  ])
).rows[0].crear_factura;
assert.ok(factId);
await db.query(`update public.empresas set direccion='Nueva dirección' where id=$1`, [ta]);
// Anexos 21/22 y contribuyente especial (Ficha Técnica 2.34): los números de
// resolución sólo se guardan en el formato que el XML emitirá ante el SRI.
await rejects(`update public.empresas set agente_retencion='0123' where id=$1`, [ta]);
await rejects(`update public.empresas set contribuyente_especial='' where id=$1`, [ta]);
await db.query(
  `update public.empresas set agente_retencion='1234', contribuyente_especial='5368' where id=$1`,
  [ta],
);
await db.query(
  `update public.empresas set agente_retencion=null, contribuyente_especial=null where id=$1`,
  [ta],
);
const audit = (
  await db.query(
    `select accion, entidad, detalle->>'estado' as estado from public.auditoria where tenant_id=$1 order by creado_en`,
    [ta],
  )
).rows;
assert.ok(
  audit.some(
    (r) => r.accion === "INSERT_facturas_sri" && r.entidad === "facturas_sri",
  ),
);
assert.ok(audit.some((r) => r.accion === "UPDATE_empresas"));
// Cada empresa ve SOLO su auditoría: B ve sus propios cambios (los de su
// tenant), jamás los de A. Comprobamos también que los de A existen y B
// no los ve, para descartar que el conteo sea 0 por otra razón.
await user(B);
const auditB = (await db.query("select tenant_id from public.auditoria")).rows;
assert.ok(auditB.length > 0, "B debe ver su propia auditoría");
assert.ok(
  auditB.every((r) => r.tenant_id === tb),
  "B jamás debe ver auditoría de otro tenant",
);
await owner();
const auditTotal = Number(
  (await db.query("select count(*) n from public.auditoria")).rows[0].n,
);
assert.ok(
  auditTotal > auditB.length,
  "la auditoría de A existe pero B no debe verla",
);
await user(B);

// --- Rate limit de emisiones: 30/hora; el superadmin no tiene límite ---
await owner();
await db.query(
  `insert into public.emision_intentos(tenant_id, creado_en) select $1, now() from generate_series(1,30)`,
  [ta],
);
await user(A);
await assert.rejects(
  () =>
    db.query(`select public.crear_factura($1,$2,gen_random_uuid())`, [
      cid,
      JSON.stringify([{ id: prod, cantidad: 1, descuento: 0 }]),
    ]),
  (e) => /RATE_LIMIT/.test(e.message),
  "A en el límite debe recibir RATE_LIMIT",
);
await owner();
await db.query(
  `insert into public.emision_intentos(tenant_id, creado_en) select $1, now() from generate_series(1,30)`,
  [tb],
);
await user(B);
await db.query(`select public.crear_factura($1,$2,gen_random_uuid())`, [
  cliB,
  JSON.stringify([{ id: prodB, cantidad: 1, descuento: 0 }]),
]);
// --- RUFO: memoria y aprendizaje por empresa, sólo el ADMIN del tenant ---
await owner();
await db.query(
  `insert into public.rufo_memoria(tenant_id,clave,valor,origen) values
    ($1,'perfil','Alquilamos grúas y vendemos cemento en Manabí','declarado'),
    ($1,'riesgo','Ventas a la baja hace 2 semanas: revisar clientes','aprendido'),
    ($2,'perfil','Recuerdo de otro negocio','declarado')`,
  [ta, tb],
);
await db.query(
  `insert into public.rufo_aprendizaje(tenant_id,clave,tipo,titulo,detalle,periodo) values
    ($1,'ventas_a_la_baja','riesgo','Ventas a la baja','Este mes vendiste 40% menos','2026-10'),
    ($2,'ventas_a_la_baja','riesgo','Hallazgo ajeno','De otro tenant','2026-10')`,
  [ta, tb],
);
// El navegador JAMÁS escribe aquí: ni inserta, ni actualiza, ni olvida.
await user(A);
await rejects(
  `insert into public.rufo_memoria(tenant_id,clave,valor) values($1,'perfil','invasión')`,
  [tb],
);
await rejects(`update public.rufo_memoria set activo=false`);
await rejects(
  `insert into public.rufo_aprendizaje(tenant_id,clave,tipo,titulo,detalle,periodo) values($1,'x','patron','t','t','2026-10')`,
  [ta],
);
await rejects(
  `insert into public.rufo_feedback(tenant_id,pregunta,respuesta,util) values($1,'p','r',true)`,
  [ta],
);
// El ADMIN de A ve SÓLO lo suyo (2 recuerdos y 1 hallazgo; jamás los de B).
assert.equal(
  (await db.query(`select count(*) n from public.rufo_memoria`)).rows[0].n,
  2,
);
assert.equal(
  (await db.query(`select count(*) n from public.rufo_aprendizaje`)).rows[0].n,
  1,
);
// B es ADMIN de OTRA empresa: ve su propio recuerdo (1), jamás los de A.
await user(B);
assert.equal(
  (await db.query(`select count(*) n from public.rufo_memoria`)).rows[0].n,
  1,
);
assert.equal(
  (await db.query(`select count(*) n from public.rufo_aprendizaje`)).rows[0].n,
  1,
);
// El rol ADMIN manda: degradado a CAJERO, el asistente queda ciego.
await owner();
await db.query(`update public.usuarios_perfiles set rol='CAJERO' where tenant_id=$1`, [ta]);
await user(A);
assert.equal(
  (await db.query(`select count(*) n from public.rufo_memoria`)).rows[0].n,
  0,
);
assert.equal(
  (await db.query(`select count(*) n from public.rufo_aprendizaje`)).rows[0].n,
  0,
);
// rufo_control (control del análisis) no tiene política: invisible al cliente.
await rejects(`select * from public.rufo_control`);
await owner();
await db.query(`update public.usuarios_perfiles set rol='ADMIN' where tenant_id=$1`, [ta]);

await db.close();
console.log(
  "PASS: SQL ejecutado en PostgreSQL WASM; RLS, trigger, aislamiento, privilegios, finanzas, stock, idempotencia, storage, vencimiento, vault y aprendizaje de RUFO.",
);
