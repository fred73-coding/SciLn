// src/js/roles.js
// Researcher role taxonomy and reference lists (countries, departments,
// degree fields, academic levels) used by the profile form.

/** @type {Array<{id:string, label:string, icon:string, positions:string[]}>} */
export const ROLE_CATEGORIES = [
  {
    id: "investigador",
    label: "Investigador/a",
    icon: "🔬",
    positions: [
      "Investigador/a Principal",
      "Investigador/a Asociado/a",
      "Investigador/a Asistente",
      "Postdoctoral",
      "Investigador/a Independiente",
    ],
  },
  {
    id: "docente",
    label: "Docente",
    icon: "👨‍🏫",
    positions: [
      "Profesor/a Titular",
      "Profesor/a Asociado/a",
      "Profesor/a Asistente",
      "Profesor/a Adjunto/a",
      "Maestro/a",
    ],
  },
  {
    id: "estudiante",
    label: "Estudiante",
    icon: "🎓",
    positions: [
      "Doctorado",
      "Maestría",
      "Licenciatura",
      "Técnico/a",
      "Intercambio",
    ],
  },
  {
    id: "tecnico",
    label: "Técnico/a de Laboratorio",
    icon: "⚗️",
    positions: [
      "Técnico/a Superior",
      "Técnico/a de Laboratorio",
      "Asistente de Laboratorio",
    ],
  },
  {
    id: "independiente",
    label: "Independiente",
    icon: "🧑‍🔬",
    positions: [
      "Científico/a Ciudadano/a",
      "Divulgador/a",
      "Autodidacta",
      "Aficionado/a",
    ],
  },
  {
    id: "profesional",
    label: "Profesional",
    icon: "💼",
    positions: [
      "Ingeniero/a",
      "Data Scientist",
      "Desarrollador/a",
      "Consultor/a",
    ],
  },
];

/** @param {string} category @returns {string|null} */
export function getRoleLabel(category) {
  const r = ROLE_CATEGORIES.find(c => c.id === category);
  return r ? r.label : null;
}

/** @param {string} category @returns {string} emoji (🧑‍🔬 fallback) */
export function getRoleIcon(category) {
  const r = ROLE_CATEGORIES.find(c => c.id === category);
  return r ? r.icon : "🧑‍🔬";
}

/** @param {string} roleId @returns {string[]} positions list for the given role */
export function getPositionsForRole(roleId) {
  const r = ROLE_CATEGORIES.find(c => c.id === roleId);
  return r ? r.positions : [];
}

export const ACADEMIC_LEVELS = [
  "Sin nivel formal",
  "Educación secundaria",
  "Técnico/a",
  "Técnico/a Superior",
  "Licenciatura",
  "Maestría",
  "Doctorado",
  "Postdoctorado",
  "Cátedra",
];

export const DEGREE_FIELDS = [
  "Física",
  "Química",
  "Biología",
  "Matemáticas",
  "Ciencias de la Computación",
  "Ingeniería",
  "Bioquímica",
  "Medicina",
  "Geología",
  "Astronomía",
  "Farmacia",
  "Ciencia de Materiales",
  "Estadística",
  "Ecología",
  "Ciencias Ambientales",
  "Oceanografía",
  "Ciencias de la Tierra",
  "Biotecnología",
  "Neurociencia",
  "Ciencia de Datos",
  "Otra",
];

export const DEPARTMENTS = [
  "Sin departamento / Independiente",
  "Laboratorio de Investigación",
  "Centro de Investigación",
  "Departamento de Física",
  "Departamento de Química",
  "Departamento de Biología",
  "Departamento de Matemáticas",
  "Departamento de Ingeniería",
  "Departamento de Ciencias de la Computación",
  "Departamento de Bioquímica",
  "Departamento de Medicina",
  "Departamento de Geología",
  "Departamento de Astronomía",
  "Departamento de Farmacia",
  "Departamento de Ciencia de Materiales",
  "Departamento de Estadística",
  "Departamento de Ecología",
  "Departamento de Ciencias Ambientales",
  "Departamento de Oceanografía",
  "Departamento de Biotecnología",
  "Departamento de Neurociencia",
];

export const COUNTRIES = [
  "Argentina",
  "Bolivia",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Cuba",
  "Ecuador",
  "El Salvador",
  "España",
  "Estados Unidos",
  "Guatemala",
  "Honduras",
  "México",
  "Nicaragua",
  "Panamá",
  "Paraguay",
  "Perú",
  "Puerto Rico",
  "República Dominicana",
  "Uruguay",
  "Venezuela",
  "Alemania",
  "Brasil",
  "Canadá",
  "Francia",
  "Italia",
  "Japón",
  "Países Bajos",
  "Portugal",
  "Reino Unido",
  "Suiza",
  "Otro",
];
