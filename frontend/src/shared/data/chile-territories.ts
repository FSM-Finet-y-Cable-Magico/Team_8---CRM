// División Político Administrativa, consultada el 2026-11-04.
// MOP: https://rest-sit.mop.gob.cl/arcgis/rest/services/INTEROP/SERVICIO_DPA/MapServer/1
// Antártica (sin polígono en la capa MOP): https://www.cmfchile.cl/institucional/seil/certificacion_comunas.php
// Copia local de las 16 regiones y 346 comunas: no requiere una API externa al completar el formulario.
export const chileRegions = [
  { codigo: "01", nombre: "Tarapacá", comunas: ["Alto Hospicio","Camiña","Colchane","Huara","Iquique","Pica","Pozo Almonte"] },
  { codigo: "02", nombre: "Antofagasta", comunas: ["Antofagasta","Calama","María Elena","Mejillones","Ollagüe","San Pedro de Atacama","Sierra Gorda","Taltal","Tocopilla"] },
  { codigo: "03", nombre: "Atacama", comunas: ["Alto del Carmen","Caldera","Chañaral","Copiapó","Diego de Almagro","Freirina","Huasco","Tierra Amarilla","Vallenar"] },
  { codigo: "04", nombre: "Coquimbo", comunas: ["Andacollo","Canela","Combarbalá","Coquimbo","Illapel","La Higuera","La Serena","Los Vilos","Monte Patria","Ovalle","Paiguano","Punitaqui","Río Hurtado","Salamanca","Vicuña"] },
  { codigo: "05", nombre: "Valparaíso", comunas: ["Algarrobo","Cabildo","Calera","Calle Larga","Cartagena","Casablanca","Catemu","Concón","El Quisco","El Tabo","Hijuelas","Isla de Pascua","Juan Fernández","La Cruz","La Ligua","Limache","Llaillay","Los Andes","Nogales","Olmué","Panquehue","Papudo","Petorca","Puchuncaví","Putaendo","Quillota","Quilpué","Quintero","Rinconada","San Antonio","San Esteban","San Felipe","Santa María","Santo Domingo","Valparaíso","Villa Alemana","Viña del Mar","Zapallar"] },
  { codigo: "06", nombre: "Libertador General Bernardo O'Higgins", comunas: ["Chépica","Chimbarongo","Codegua","Coinco","Coltauco","Doñihue","Graneros","La Estrella","Las Cabras","Litueche","Lolol","Machalí","Malloa","Marchihue","Mostazal","Nancagua","Navidad","Olivar","Palmilla","Paredones","Peralillo","Peumo","Pichidegua","Pichilemu","Placilla","Pumanque","Quinta de Tilcoco","Rancagua","Rengo","Requínoa","San Fernando","San Vicente","Santa Cruz"] },
  { codigo: "07", nombre: "Maule", comunas: ["Cauquenes","Chanco","Colbún","Constitución","Curepto","Curicó","Empedrado","Hualañé","Licantén","Linares","Longaví","Maule","Molina","Parral","Pelarco","Pelluhue","Pencahue","Rauco","Retiro","Río Claro","Romeral","Sagrada Familia","San Clemente","San Javier","San Rafael","Talca","Teno","Vichuquén","Villa Alegre","Yerbas Buenas"] },
  { codigo: "08", nombre: "Biobío", comunas: ["Alto Biobío","Antuco","Arauco","Cabrero","Cañete","Chiguayante","Concepción","Contulmo","Coronel","Curanilahue","Florida","Hualpén","Hualqui","Laja","Lebu","Los Alamos","Los Angeles","Lota","Mulchén","Nacimiento","Negrete","Penco","Quilaco","Quilleco","San Pedro de la Paz","San Rosendo","Santa Bárbara","Santa Juana","Talcahuano","Tirúa","Tomé","Tucapel","Yumbel"] },
  { codigo: "09", nombre: "La Araucanía", comunas: ["Angol","Carahue","Cholchol","Collipulli","Cunco","Curacautín","Curarrehue","Ercilla","Freire","Galvarino","Gorbea","Lautaro","Loncoche","Lonquimay","Los Sauces","Lumaco","Melipeuco","Nueva Imperial","Padre Las Casas","Perquenco","Pitrufquén","Pucón","Purén","Renaico","Saavedra","Temuco","Teodoro Schmidt","Toltén","Traiguén","Victoria","Vilcún","Villarrica"] },
  { codigo: "10", nombre: "Los Lagos", comunas: ["Ancud","Calbuco","Castro","Chaitén","Chonchi","Cochamó","Curaco de Vélez","Dalcahue","Fresia","Frutillar","Futaleufú","Hualaihué","Llanquihue","Los Muermos","Maullín","Osorno","Palena","Puerto Montt","Puerto Octay","Puerto Varas","Puqueldón","Purranque","Puyehue","Queilén","Quellón","Quemchi","Quinchao","Río Negro","San Juan de la Costa","San Pablo"] },
  { codigo: "11", nombre: "Aysén del General Carlos Ibáñez del Campo", comunas: ["Aisén","Chile Chico","Cisnes","Cochrane","Coihaique","Guaitecas","Lago Verde","O'Higgins","Río Ibáñez","Tortel"] },
  { codigo: "12", nombre: "Magallanes y de la Antártica Chilena", comunas: ["Antártica","Cabo de Hornos","Laguna Blanca","Natales","Porvenir","Primavera","Punta Arenas","Río Verde","San Gregorio","Timaukel","Torres del Paine"] },
  { codigo: "13", nombre: "Metropolitana de Santiago", comunas: ["Alhué","Buin","Calera de Tango","Cerrillos","Cerro Navia","Colina","Conchalí","Curacaví","El Bosque","El Monte","Estación Central","Huechuraba","Independencia","Isla de Maipo","La Cisterna","La Florida","La Granja","La Pintana","La Reina","Lampa","Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipú","María Pinto","Melipilla","Ñuñoa","Padre Hurtado","Paine","Pedro Aguirre Cerda","Peñaflor","Peñalolén","Pirque","Providencia","Pudahuel","Puente Alto","Quilicura","Quinta Normal","Recoleta","Renca","San Bernardo","San Joaquín","San José de Maipo","San Miguel","San Pedro","San Ramón","Santiago","Talagante","Tiltil","Vitacura"] },
  { codigo: "14", nombre: "Los Ríos", comunas: ["Corral","Futrono","La Unión","Lago Ranco","Lanco","Los Lagos","Máfil","Mariquina","Paillaco","Panguipulli","Río Bueno","Valdivia"] },
  { codigo: "15", nombre: "Arica y Parinacota", comunas: ["Arica","Camarones","General Lagos","Putre"] },
  { codigo: "16", nombre: "Ñuble", comunas: ["Bulnes","Chillán","Chillán Viejo","Cobquecura","Coelemu","Coihueco","El Carmen","Ninhue","Ñiquén","Pemuco","Pinto","Portezuelo","Quillón","Quirihue","Ranquil","San Carlos","San Fabián","San Ignacio","San Nicolás","Treguaco","Yungay"] },
];

export function normalizeTerritory(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL').replace(/[^a-z0-9]/g, '').replace(/^region(del|de)?/, '');
}

export function findChileRegion(value: string) {
  const normalized = normalizeTerritory(value);
  if (normalized === 'metropolitana' || normalized === 'rm') return chileRegions.find(region => region.codigo === '13');
  return chileRegions.find(region => normalizeTerritory(region.nombre) === normalized);
}
