# Confirmación de correo en Supabase

El formulario envía y permite reenviar correos con Supabase Auth. Para que los
usuarios los reciban en producción, completa esta configuración en el proyecto
de Supabase (Dashboard → **Authentication**):

1. En **URL Configuration**, establece la URL pública de la web como **Site
   URL**. Añade también `https://TU-DOMINIO/auth/confirm` en **Redirect URLs**.
   Para desarrollo local, añade `http://127.0.0.1:5173/auth/confirm` y/o
   `http://localhost:5173/auth/confirm`.
2. En **Providers → Email**, conserva activa la confirmación de correo.
3. En **SMTP Settings**, configura un proveedor propio con dominio verificado
   (por ejemplo Resend, Postmark, Amazon SES o Brevo). El correo predeterminado
   de Supabase solo entrega a direcciones autorizadas de miembros del proyecto,
   tiene límites estrictos y no debe usarse como servicio de producción.
4. Personaliza la plantilla **Confirm signup** con `{{ .ConfirmationURL }}`.
   No reemplaces esa variable por una URL fija.
5. Revisa el registro de Auth y el log del proveedor SMTP tras una prueba. Si
   Supabase acepta el registro pero no hay registro de entrega SMTP, el problema
   está en la configuración del proveedor y no en el navegador.

No coloques credenciales SMTP, `service_role` ni claves de correo en variables
`VITE_*`: esas variables se publican en el navegador.
