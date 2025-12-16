import { SidebarLayout } from "@/components/sidebar-layout";

export default function Home() {
  return (
    <SidebarLayout>
      <div className="flex flex-col items-center justify-center gap-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Bienvenido a Capital Galaxy</h1>
          <p className="text-muted-foreground">
            Proyecto configurado con Next.js 16, React 19 y Tailwind CSS v4
          </p>
        </div>
        
        <div className="mt-8 p-6 border rounded-lg bg-card text-card-foreground max-w-md w-full">
          <h2 className="text-xl font-semibold mb-4">Estado del Setup</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Estructura de carpetas creada</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Tema claro/oscuro configurado</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Utilidades esenciales (cn, env)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Sidebar y navegación</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-yellow-500">⋯</span>
              <span>Autenticación (próximo)</span>
            </li>
          </ul>
        </div>
      </div>
    </SidebarLayout>
  );
}
