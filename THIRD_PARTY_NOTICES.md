# Atribuciones de terceros

Código y datos de terceros incluidos o consumidos por este proyecto. Se actualiza al copiar un
componente o añadir una fuente de datos.

## Datos

| Fuente | Licencia | Uso |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org/) | Teselas de OpenMapTiles sobre datos de OpenStreetMap (ODbL) | Mapa base del componente geoespacial |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL 1.0 | Datos del mapa base |
| [Natural Earth](https://www.naturalearthdata.com/) | Dominio público | Fronteras de países (1:50m) y de departamentos de Colombia y de la cuenca amazónica (1:10m), versionadas en `backend/precompute/data/` |
| [geoBoundaries](https://www.geoboundaries.org/) (Runfola et al., 2020, *PLoS ONE* 15(4): e0231866) | CC BY 4.0 | Geometría municipal (ADM2 gbOpen) de Bolivia, Brasil, Colombia, Ecuador, Perú y Venezuela, con las coordenadas redondeadas a cuatro decimales. Se descarga al precomputar; no se versiona |
| [Amazon Underworld](https://amazonunderworld.org/) (InfoAmazonia y Armando.info) | CC BY 4.0 | Presencia de grupos armados por municipio de la cuenca amazónica, leída del índice de la Etapa 1 |

## Código

| Componente | Origen | Licencia | Dónde |
|---|---|---|---|
| Envoltorio declarativo de MapLibre | [mapcn](https://github.com/AnmolSaini16/mapcn) | MIT | `frontend/components/ui/map.tsx` |
| Componentes de interfaz | [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT | `frontend/components/ui/` |
| Componentes del chat | [AI Elements](https://github.com/vercel/ai-elements) | Apache 2.0 | `frontend/components/ai-elements/` |
| Banderas | [flag-icons](https://github.com/lipis/flag-icons) | MIT | `frontend/components/flag.tsx` |

Las dependencias directas y sus licencias están en `frontend/package.json` y
`backend/pyproject.toml`, con las versiones exactas fijadas en los archivos de bloqueo.
