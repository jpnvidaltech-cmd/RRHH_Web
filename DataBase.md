Tareas

1) Base de Datos. Generar para el entorno de SupaBAse el script SQL necesario para crear una base de datos compuesta por los siguientes campos:
- Nombre , string
- Apellido , string
- Profesion, string
- Ciudad , string
- Pais , string
- Fecha de Nacimiento , date
- Perfil Laboral , text
- Experiencia , text
- Habilidades , text
- Idiomas , text
- Educacion , text
- Email	, string
- File Hash	, string
- WebCVLink , string
- Recurso , string

2) Modificaciones en la Aplicacion. Generar una conexion con la plataforma de autenticacion de usuarios utilizando los features de SupaBase de Athentication, con 2 roles:
- Administrador, tiene la funcion de poder subir nuevos curriculums a la aplicacion y acceso a todas las funciones del sistema
- usuario, tiene la funcion de poder poder buscar Curriculums, ver los detalles, acceder a los links de los curriculums. No puede subir nuevos Curriculums.
Datos de conexion en SupaBase:
NEXT_PUBLIC_SUPABASE_URL=https://supabase-supabase.5tx6ny.easypanel.host
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzE4MzIzMjAwLCJleHAiOjI3MTgzMjMyMDB9.bv7Is7xG380Ot19U_PIpxN8geajxYA28IWc36VUNgAI

3) Debes adaptar el codigo actual para que se integre con las funcionalidades de autenticacion de SupaBase y que pueda acceder a las funciones de la aplicacion. 

4) Debes mantener el funcionamiento de los webhooks actuales que conectan con la plataforma de N8N, no generar cambios en el funcionamiento de los webhooks.
