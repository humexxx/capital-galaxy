# Reglas del Proyecto y Arquitectura

Este documento define la fuente de verdad técnica para **Capital Galaxy**.
Cualquier agente de IA o desarrollador que trabaje en este proyecto debe alinear su código con estos estándares.

## 1. Stack Tecnológico

-   **Framework:** Next.js 16 (App Router)
-   **Lenguaje:** TypeScript (Strict Mode)
-   **Estilos:** Tailwind CSS v4 (Sin CSS modules, sin `style={{}}` inline)
-   **Componentes:** Shadcn UI (basado en Radix UI)
-   **Base de Datos:** Supabase (PostgreSQL)
-   **ORM (Opcional):** Drizzle ORM (Preferido para migraciones complejas, pero Supabase client directo es aceptable para operaciones simples si se mantiene type-safety)
-   **Estado:** React Server Components (RSC) para data fetching, Hooks para estado local. Evitar Redux/Context global innecesario.

## 2. Estructura de Directorios

```
/app
  /portal           # Rutas protegidas de la aplicación principal
  /auth             # Rutas de autenticación (login, signup)
  /api              # Route Handlers (solo si Server Actions no son suficientes)
  globals.css       # Estilos globales (Tailwind imports)
  layout.tsx        # Root Layout

/components
  /ui               # Componentes Shadcn (Botones, Inputs, Cards...)
  /portfolio        # Componentes específicos del feature Portfolio
  /auth             # Componentes específicos de Auth
  /...              # Otros directorios por feature

/lib
  /supabase         # Clientes de Supabase (client/server)
  /utils.ts         # Utility functions (cn, formatters)
```

## 3. Reglas de Desarrollo

### 3.1. Data Fetching & Mutaciones
-   **Server Components:** Hacer fetch de datos directamente en el componente (`await supabase.from...`).
-   **Server Actions:** Usar Server Actions para TODAS las mutaciones (CREATE, UPDATE, DELETE).
    -   Ubicación: `/app/actions/[feature].ts` o dentro del mismo archivo si es pequeño.
    -   Validación: Usar Zod para validar inputs en el Server Action.

### 3.2. Estilos (Tailwind CSS)
-   **NUNCA** crear archivos `.css` nuevos.
-   **NUNCA** usar estilos inline `style="..."`.
-   Usar las clases utilitarias de Tailwind.
-   Usar las variables CSS definidas en `global.css` para colores (`bg-background`, `text-foreground`, `border-border`) para soportar Dark Mode automáticamente.

### 3.3. Componentes
-   **Atomic Design Simplificado:** `/components/ui` son átomos (botones, inputs). `/components/[feature]` son moléculas/organismos.
-   **Client vs Server:** Usa `"use client"` solo en los componentes hoja que necesiten interactividad (onClick, useState). Mantén las páginas (`page.tsx`) como Server Components siempre que sea posible.

## 4. Flujo de Trabajo con Agentes

### 1 Agente = 1 Feature
-   Cada agente o sesión de trabajo debe enfocarse en UNA sola funcionalidad vertical (ej: "Crear Transacción", "Ver Gráfico").
-   El agente tiene permiso para editar DB, Backend y Frontend de esa feature.
-   Si se requiere tocar código compartido (`globals.css`, `layout.tsx`), hacerlo con extrema precaución para no romper otros features.

### Manejo de Ramas
-   Siempre trabajar en una rama separada: `feature/nombre-del-feature`.
