-- Plantilla de capacitación · esquema de Supabase
-- Córrelo completo en Supabase → SQL Editor. Se puede volver a correr sin perder datos.
-- Seguridad: cada tabla tiene reglas por fila (RLS). La "anon key" de la página no da acceso a nada sin sesión.

-- ───────── Tablas ─────────
create table if not exists organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  limite_usuarios int not null default 10 check (limite_usuarios > 0),
  licencia_hasta date,                          -- null = sin vencimiento
  creada timestamptz not null default now()
);

create table if not exists miembros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones(id) on delete cascade,
  correo text not null,
  nombre text,
  rol text not null default 'personal' check (rol in ('admin', 'personal')),
  activo boolean not null default true,
  user_id uuid references auth.users(id) on delete set null,   -- se liga la primera vez que entra con Google
  alta timestamptz not null default now(),
  unique (org_id, correo)
);
create index if not exists miembros_user on miembros(user_id);

create table if not exists contenido (
  org_id uuid primary key references organizaciones(id) on delete cascade,
  menu jsonb not null,                          -- mismo formato que data.js
  actualizado timestamptz not null default now()
);

create table if not exists progreso (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizaciones(id) on delete cascade,
  estado jsonb not null default '{}',           -- tarjetas, historial y exámenes del teléfono
  vistas int not null default 0,
  dominadas int not null default 0,
  total int not null default 0,
  actualizado timestamptz not null default now()
);

create table if not exists actividad (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizaciones(id) on delete cascade,
  dia date not null,
  segundos int not null default 0,              -- tiempo en uso, con la pantalla visible
  tarjetas int not null default 0,
  primary key (user_id, dia)
);

create table if not exists examenes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizaciones(id) on delete cascade,
  hecho timestamptz not null default now(),
  aciertos int not null,
  total int not null,
  tema text
);

-- ───────── Funciones de apoyo ─────────
-- Organización activa de quien llama.
create or replace function org_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from miembros m where m.user_id = auth.uid() and m.activo order by m.alta limit 1
$$;

create or replace function es_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros m where m.org_id = org and m.user_id = auth.uid() and m.activo and m.rol = 'admin')
$$;

create or replace function licencia_vigente(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizaciones o where o.id = org and (o.licencia_hasta is null or o.licencia_hasta >= current_date))
$$;

-- Al entrar: liga el correo dado de alta con la cuenta de Google y devuelve su acceso.
create or replace function entrar()
returns table (org_id uuid, organizacion text, rol text, licencia_hasta date, vigente boolean)
language plpgsql security definer set search_path = public as $$
declare correo_jwt text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or correo_jwt = '' then return; end if;
  update miembros m
     set user_id = auth.uid(),
         nombre = coalesce(m.nombre, auth.jwt() -> 'user_metadata' ->> 'full_name')
   where m.correo = correo_jwt and m.user_id is null;
  return query
    select m.org_id, o.nombre, m.rol, o.licencia_hasta, (o.licencia_hasta is null or o.licencia_hasta >= current_date)
      from miembros m join organizaciones o on o.id = m.org_id
     where m.user_id = auth.uid() and m.activo
     order by m.alta limit 1;
end $$;

-- Suma tiempo y tarjetas del día sin que el teléfono tenga que leer antes (evita choques entre dispositivos).
create or replace function sumar_actividad(p_dia date, p_segundos int, p_tarjetas int) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid := org_actual();
begin
  if org is null then raise exception 'Sin acceso'; end if;
  if p_dia not between current_date - 7 and current_date + 1 then raise exception 'Fecha fuera de rango'; end if;
  insert into actividad as a (user_id, org_id, dia, segundos, tarjetas)
  values (auth.uid(), org, p_dia, greatest(0, least(p_segundos, 3600)), greatest(0, least(p_tarjetas, 500)))
  on conflict (user_id, dia) do update
    set segundos = least(a.segundos + excluded.segundos, 86400),
        tarjetas = a.tarjetas + excluded.tarjetas;
end $$;

-- Tabla del panel "Equipo": una fila por persona con frecuencia, tiempo y resultados.
create or replace function resumen_equipo()
returns table (miembro_id uuid, correo text, nombre text, rol text, activo boolean,
               ultimo_acceso date, dias_7 int, dias_30 int, minutos int, tarjetas int,
               vistas int, dominadas int, total int, num_examenes int, ultimo_examen text)
language plpgsql stable security definer set search_path = public as $$
declare org uuid := org_actual();
begin
  if org is null or not es_admin(org) then raise exception 'Solo el administrador puede ver el equipo'; end if;
  return query
    select m.id, m.correo, m.nombre, m.rol, m.activo,
           act.ultimo, act.d7::int, act.d30::int, (act.seg / 60)::int, act.tar::int,
           coalesce(p.vistas, 0), coalesce(p.dominadas, 0), coalesce(p.total, 0),
           ex.n::int, ex.ultimo
      from miembros m
      left join progreso p on p.user_id = m.user_id and p.org_id = org
      left join lateral (
        select max(a.dia) as ultimo,
               count(*) filter (where a.dia > current_date - 7) as d7,
               count(*) filter (where a.dia > current_date - 30) as d30,
               coalesce(sum(a.segundos), 0) as seg,
               coalesce(sum(a.tarjetas), 0) as tar
          from actividad a where a.user_id = m.user_id and a.org_id = org) act on true
      left join lateral (
        select count(*) as n, (array_agg(e.aciertos || '/' || e.total order by e.hecho desc))[1] as ultimo
          from examenes e where e.user_id = m.user_id and e.org_id = org) ex on true
     where m.org_id = org
     order by m.activo desc, m.correo;
end $$;

-- Licencia: no deja activar más usuarios que el límite contratado.
create or replace function revisar_limite() returns trigger
language plpgsql security definer set search_path = public as $$
declare limite int; activos int;
begin
  new.correo := lower(trim(new.correo));
  if new.activo and (tg_op = 'INSERT' or not old.activo) then   -- solo al dar de alta o reactivar
    select o.limite_usuarios into limite from organizaciones o where o.id = new.org_id;
    select count(*) into activos from miembros m where m.org_id = new.org_id and m.activo and m.id <> new.id;
    if activos >= limite then
      raise exception 'La licencia permite % usuarios activos. Desactiva a alguien o amplía la licencia.', limite;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists miembros_limite on miembros;
create trigger miembros_limite before insert or update on miembros
  for each row execute function revisar_limite();

-- ───────── Reglas de acceso (RLS) ─────────
alter table organizaciones enable row level security;
alter table miembros enable row level security;
alter table contenido enable row level security;
alter table progreso enable row level security;
alter table actividad enable row level security;
alter table examenes enable row level security;
revoke all on all tables in schema public from anon;

drop policy if exists org_ver on organizaciones;
create policy org_ver on organizaciones for select using (id = org_actual());

drop policy if exists miembros_ver on miembros;
drop policy if exists miembros_alta on miembros;
drop policy if exists miembros_cambio on miembros;
drop policy if exists miembros_baja on miembros;
create policy miembros_ver on miembros for select using (user_id = auth.uid() or es_admin(org_id));
create policy miembros_alta on miembros for insert with check (es_admin(org_id));
create policy miembros_cambio on miembros for update using (es_admin(org_id)) with check (es_admin(org_id));
create policy miembros_baja on miembros for delete using (es_admin(org_id));

-- El contenido lo carga el proveedor desde el SQL Editor; el personal solo lo lee con licencia vigente.
drop policy if exists contenido_ver on contenido;
create policy contenido_ver on contenido for select using (org_id = org_actual() and licencia_vigente(org_id));

drop policy if exists progreso_ver on progreso;
drop policy if exists progreso_guardar on progreso;
drop policy if exists progreso_cambiar on progreso;
create policy progreso_ver on progreso for select using (user_id = auth.uid() or es_admin(org_id));
create policy progreso_guardar on progreso for insert with check (user_id = auth.uid() and org_id = org_actual());
create policy progreso_cambiar on progreso for update using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id = org_actual());

-- La actividad solo se escribe con sumar_actividad().
drop policy if exists actividad_ver on actividad;
create policy actividad_ver on actividad for select using (user_id = auth.uid() or es_admin(org_id));

drop policy if exists examenes_ver on examenes;
drop policy if exists examenes_guardar on examenes;
create policy examenes_ver on examenes for select using (user_id = auth.uid() or es_admin(org_id));
create policy examenes_guardar on examenes for insert with check (user_id = auth.uid() and org_id = org_actual());

-- ───────── Alta inicial (edita y corre solo estas líneas, una vez por cliente) ─────────
-- insert into organizaciones (nombre, limite_usuarios, licencia_hasta)
--   values ('Restaurante Piloto', 15, '2027-01-31') returning id;
-- insert into miembros (org_id, correo, rol)
--   values ('<id que regresó la línea anterior>', 'gerente@ejemplo.com', 'admin');
-- Luego carga su menú con: node herramientas/contenido-a-sql.js <archivo-del-menu.js> <org_id>
