import Brand from "../components/Brand";
export default function Legal() {
  return (
    <div className="marketing legal">
      <header>
        <Brand />
      </header>
      <main>
        <h1>Términos de MULTIFACTU</h1>
        <p className="notice">
          Borrador propio: completar razón social, RUC, dirección y responsable
          de privacidad del proveedor antes del lanzamiento.
        </p>
        <h2>Servicio y planes</h2>
        <p>
          El servicio organiza ventas, inventario, alquileres y finanzas según
          el plan contratado. La entrega actual usa Supabase y simula emisión
          SRI; no ofrece una autorización tributaria real ni declara respaldo
          oficial.
        </p>
        <h2>Prueba gratis y cancelación</h2>
        <p>
          El registro inicia una prueba Luxury de siete días consecutivos. No
          exige tarjeta ni genera cobros automáticos. Al vencer se bloquean
          funciones y los datos permanecen. Puedes cancelar cuando quieras
          dejando de renovar o contactando al 0987516088. La cancelación no
          genera automáticamente el reembolso de un período utilizado.
        </p>
        <h2>Pago y cambios</h2>
        <p>
          Inicial cuesta $5, Pro $10 y Luxury $12 mensuales más IVA. Sólo un
          pago confirmado por el proveedor activa el plan. Renovar el mismo plan
          amplía un mes; cambiar de plan lo reemplaza inmediatamente por un mes,
          sin prorrateo. Una simulación no activa suscripciones.
        </p>
        <h2 id="privacidad">Política de privacidad</h2>
        <p>
          Se tratan nombre, empresa, cédula/RUC, email, perfil, suscripción,
          datos fiscales y operaciones. Supabase Auth gestiona las contraseñas y
          sesiones; PostgreSQL aplica aislamiento mediante RLS. Los archivos se
          almacenan en buckets privados. La contraseña del certificado no se
          guarda.
        </p>
        <p>
          El cliente controla la exactitud de su información y las personas
          autorizadas. El proveedor debe definir plazos de conservación,
          procedimiento de exportación/eliminación, contacto de privacidad y
          acuerdos de alojamiento. No se promete respaldo automático o
          disponibilidad garantizada sin contratar y verificar esos servicios.
        </p>
        <a href="tel:0987516088">Contacto: 0987516088</a>
      </main>
    </div>
  );
}
