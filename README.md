# Capital Galaxy

Aplicación empresarial construida con Next.js 16, React 19 y Tailwind CSS v4.

## 🚀 Características

- ✅ **Next.js 16** con App Router
- ✅ **React 19** con Server Components
- ✅ **Tailwind CSS v4** con tema personalizado
- ✅ **TypeScript** para type safety
- ✅ **shadcn/ui** componentes pre-configurados
- ✅ **Tema claro/oscuro** con next-themes
- ✅ **Sidebar responsivo** con navegación
- ✅ **Validación de formularios** con react-hook-form + Zod
- ✅ **Arquitectura escalable** con separación de concerns

## 📁 Estructura del Proyecto

```
├── app/                    # App Router de Next.js
│   ├── globals.css        # Estilos globales y variables de tema
│   ├── layout.tsx         # Layout principal con ThemeProvider
│   └── page.tsx           # Página de inicio
├── components/            # Componentes React
│   ├── ui/               # Componentes de shadcn/ui
│   ├── app-sidebar.tsx   # Sidebar de navegación
│   ├── sidebar-layout.tsx # Layout wrapper con sidebar
│   ├── theme-provider.tsx # Provider de tema
│   └── mode-toggle.tsx   # Toggle de tema claro/oscuro
├── lib/                   # Utilidades y servicios
│   ├── services/         # Servicios de API
│   ├── utils.ts          # Funciones auxiliares (cn, etc.)
│   └── env.ts            # Gestión de variables de entorno
├── types/                 # Definiciones de TypeScript
├── schemas/               # Esquemas Zod para validación
├── hooks/                 # Custom React hooks
├── db/                    # Base de datos (Drizzle ORM)
├── docs/                  # Documentación del proyecto
└── public/                # Archivos estáticos
```

## 🏃 Inicio Rápido

### Prerequisitos

- Node.js 22+
- npm, pnpm o yarn

### Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd capital-galaxy

# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) en tu navegador.

## 🛠️ Scripts Disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # Linter
```

## 🎨 Tema

El proyecto incluye soporte completo para tema claro/oscuro:

- Variables CSS personalizadas en `app/globals.css`
- Toggle de tema en el sidebar
- Soporte para preferencia del sistema
- Transiciones suaves entre temas

## 📚 Documentación

Para más información sobre la configuración y mejores prácticas del proyecto, consulta:

- [Setup Guide](./docs/setup-guide.md) - Guía completa de configuración

## 🏗️ Próximos Pasos

- [ ] Configurar autenticación con Supabase
- [ ] Configurar base de datos con Drizzle ORM
- [ ] Implementar GitHub Actions para CI/CD
- [ ] Agregar tests unitarios y de integración

## 📖 Recursos

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Hook Form](https://react-hook-form.com)
- [Zod](https://zod.dev)

## 📝 Licencia

Este proyecto es privado y confidencial.
