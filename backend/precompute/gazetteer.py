"""Vocabulario de entidades por tipo, con los tipos de la taxonomia del reto.

Se extrae por diccionario y no por modelo: inferir entidades sobre 1.826 documentos se come el
presupuesto, y un nombre propio no necesita razonamiento para reconocerse.

Cada entrada es `(nombre canonico, tipo, [formas con que el corpus lo nombra])`. El nombre canonico
es el que se muestra; las formas son lo que se busca en el texto.
"""

ENTITIES: list[tuple[str, str, list[str]]] = [
    # --- Agencias y organismos espaciales
    ("NASA", "organization", ["NASA", "National Aeronautics and Space Administration"]),
    ("European Space Agency", "organization", ["European Space Agency", "ESA", "Agencia Espacial Europea"]),
    ("Roscosmos", "organization", ["Roscosmos", "Roskosmos"]),
    ("CNSA", "organization", ["China National Space Administration", "CNSA"]),
    ("ISRO", "organization", ["Indian Space Research Organisation", "ISRO"]),
    ("JAXA", "organization", ["JAXA", "Japan Aerospace Exploration Agency"]),
    ("INPE", "organization", ["Instituto Nacional de Pesquisas Espaciais", "INPE"]),
    ("US Space Force", "organization", ["United States Space Force", "U.S. Space Force", "US Space Force", "Space Force"]),
    ("US Space Command", "organization", ["United States Space Command", "U.S. Space Command", "USSPACECOM"]),
    ("NORAD", "organization", ["NORAD", "North American Aerospace Defense Command"]),
    ("DARPA", "organization", ["DARPA", "Defense Advanced Research Projects Agency"]),
    ("NATO", "organization", ["NATO", "North Atlantic Treaty Organization", "OTAN"]),
    ("Pentagon", "organization", ["Pentagon", "Pentagono", "Department of Defense", "DoD"]),

    # --- Organismos internacionales
    ("UNOOSA", "international_body", ["UNOOSA", "Office for Outer Space Affairs", "Oficina de Asuntos del Espacio Ultraterrestre"]),
    ("COPUOS", "international_body", ["COPUOS", "Committee on the Peaceful Uses of Outer Space"]),
    ("UN General Assembly", "international_body", ["UN General Assembly", "General Assembly", "Asamblea General"]),
    ("UN Security Council", "international_body", ["Security Council", "Consejo de Seguridad"]),
    ("ITU", "international_body", ["International Telecommunication Union", "ITU", "UIT"]),
    ("OAS", "international_body", ["Organization of American States", "OEA", "MAPP-OEA"]),
    ("FAO", "international_body", ["FAO", "Food and Agriculture Organization"]),

    # --- Empresas
    ("SpaceX", "company", ["SpaceX", "Space Exploration Technologies"]),
    ("Blue Origin", "company", ["Blue Origin"]),
    ("Boeing", "company", ["Boeing"]),
    ("Lockheed Martin", "company", ["Lockheed Martin"]),
    ("Northrop Grumman", "company", ["Northrop Grumman"]),
    ("Airbus", "company", ["Airbus"]),
    ("Rocket Lab", "company", ["Rocket Lab"]),
    ("Palantir", "company", ["Palantir"]),
    ("Anduril", "company", ["Anduril"]),
    ("OpenAI", "company", ["OpenAI"]),
    ("Maxar", "company", ["Maxar"]),
    ("Planet Labs", "company", ["Planet Labs"]),

    # --- Programas y sistemas
    ("Artemis", "program", ["Artemis Program", "Artemis Accords", "Artemis"]),
    ("Starlink", "program", ["Starlink"]),
    ("Starship", "program", ["Starship"]),
    ("Golden Dome", "program", ["Golden Dome"]),
    ("Iron Dome", "program", ["Iron Dome"]),
    ("International Space Station", "program", ["International Space Station", "ISS", "Estacion Espacial Internacional"]),
    ("Sentinel", "program", ["Sentinel-1", "Sentinel-2", "Sentinel"]),
    ("Landsat", "program", ["Landsat"]),
    ("Copernicus", "program", ["Copernicus"]),
    ("JADC2", "program", ["Joint All-Domain Command and Control", "JADC2"]),
    ("Project Maven", "program", ["Project Maven", "Maven"]),
    ("Plan Colombia", "program", ["Plan Colombia"]),

    # --- Tratados y marcos
    ("Outer Space Treaty", "treaty", ["Outer Space Treaty", "Tratado del Espacio Ultraterrestre"]),
    ("Registration Convention", "treaty", ["Registration Convention", "Convenio sobre el Registro"]),
    ("Liability Convention", "treaty", ["Liability Convention", "Convenio sobre Responsabilidad"]),
    ("Rescue Agreement", "treaty", ["Rescue Agreement", "Acuerdo de Salvamento"]),
    ("Moon Agreement", "treaty", ["Moon Agreement", "Acuerdo sobre la Luna"]),
    ("Escazu Agreement", "treaty", ["Escazu Agreement", "Acuerdo de Escazu"]),

    # --- Normas y tecnologias
    ("GNSS", "technical_standard", ["GNSS", "Global Navigation Satellite System"]),
    ("GPS", "technical_standard", ["GPS", "Global Positioning System"]),
    ("Galileo", "technical_standard", ["Galileo"]),
    ("BeiDou", "technical_standard", ["BeiDou", "Beidou"]),
    ("GLONASS", "technical_standard", ["GLONASS"]),
    ("ISO", "technical_standard", ["International Organization for Standardization", "ISO"]),
    ("Space Debris Mitigation Guidelines", "technical_standard",
     ["Space Debris Mitigation Guidelines", "Directrices para la Reduccion de Desechos Espaciales"]),
    ("Machine learning", "technical_standard", ["machine learning", "aprendizaje automatico", "aprendizado de maquina"]),
    ("Large language model", "technical_standard", ["large language model", "LLM", "modelo de lenguaje"]),
    ("Computer vision", "technical_standard", ["computer vision", "vision por computador", "vision artificial"]),
    ("Autonomous weapon", "technical_standard",
     ["autonomous weapon", "lethal autonomous weapon", "arma autonoma", "LAWS"]),
    ("Remote sensing", "technical_standard", ["remote sensing", "teledeteccion", "sensoriamento remoto"]),
    ("SAR", "technical_standard", ["synthetic aperture radar", "SAR"]),

    # --- Lugares
    ("Low Earth Orbit", "place", ["Low Earth Orbit", "LEO", "orbita baja"]),
    ("Geostationary orbit", "place", ["geostationary orbit", "GEO", "orbita geoestacionaria"]),
    ("Moon", "place", ["the Moon", "lunar surface", "la Luna"]),
    ("Mars", "place", ["Mars", "Marte"]),
    ("Amazon basin", "place", ["Amazon basin", "Amazonia", "Amazonas", "Amazonia"]),
    ("Darien Gap", "place", ["Darien Gap", "Tapon del Darien", "Darien"]),
    ("Catatumbo", "place", ["Catatumbo"]),
    ("Orinoquia", "place", ["Orinoquia"]),
    # --- F3: actores, instituciones y economias del territorio latinoamericano
    ("Defensoria del Pueblo", "organization", ["Defensoria del Pueblo", "Defensoria"]),
    ("MAPP-OEA", "organization", ["MAPP-OEA", "Mision de Apoyo al Proceso de Paz"]),
    ("Fuerza Publica", "organization", ["Fuerza Publica", "Fuerzas Militares", "Ejercito Nacional", "Policia Nacional"]),
    ("Fuerza Aerea Colombiana", "organization", ["Fuerza Aeroespacial Colombiana", "Fuerza Aerea Colombiana", "FAC"]),
    ("UNODC", "international_body", ["UNODC", "Oficina de las Naciones Unidas contra la Droga y el Delito"]),
    ("ACNUR", "international_body", ["ACNUR", "UNHCR", "Alto Comisionado de las Naciones Unidas para los Refugiados"]),
    ("OCHA", "international_body", ["OCHA"]),
    ("ICBF", "organization", ["ICBF", "Instituto Colombiano de Bienestar Familiar"]),
    ("IDEAM", "organization", ["IDEAM"]),
    ("ELN", "organization", ["ELN", "Ejercito de Liberacion Nacional"]),
    ("Clan del Golfo", "organization", ["Clan del Golfo", "Autodefensas Gaitanistas", "AGC"]),
    ("Disidencias FARC", "organization", ["disidencias de las FARC", "FARC-EP", "Estado Mayor Central", "Segunda Marquetalia"]),
    ("Tren de Aragua", "organization", ["Tren de Aragua"]),
    ("Comando de la Frontera", "organization", ["Comando de la Frontera"]),
    ("Primeiro Comando da Capital", "organization", ["Primeiro Comando da Capital", "PCC"]),
    ("Illegal mining", "technical_standard", ["illegal mining", "mineria ilegal", "mineria ilicita", "garimpo"]),
    ("Coca cultivation", "technical_standard", ["coca cultivation", "cultivos de coca", "cultivos ilicitos"]),
    ("Drug trafficking", "technical_standard", ["drug trafficking", "narcotrafico", "trafico de drogas"]),
    ("Deforestation", "technical_standard", ["deforestation", "deforestacion", "desmatamento"]),
    ("Forced displacement", "technical_standard", ["forced displacement", "desplazamiento forzado", "confinamiento"]),
    ("Forced recruitment", "technical_standard", ["forced recruitment", "reclutamiento forzado", "reclutamiento de menores"]),
    ("Human trafficking", "technical_standard", ["human trafficking", "trata de personas", "trafico de migrantes"]),
    ("Antipersonnel mines", "technical_standard", ["antipersonnel mines", "minas antipersonal", "MAP/MUSE"]),
    ("Early warning", "technical_standard", ["alerta temprana", "alertas tempranas", "early warning"]),
    ("Peace Agreement", "treaty", ["Acuerdo Final de Paz", "Acuerdo de Paz", "Peace Agreement"]),

    # --- F1: mas vocabulario de IA en entornos militares
    ("Command and control", "technical_standard", ["command and control", "mando y control"]),
    ("Decision support", "technical_standard", ["decision support", "apoyo a la decision"]),
    ("Drone swarm", "technical_standard", ["drone swarm", "enjambre de drones", "swarming"]),
    ("Unmanned aerial vehicle", "technical_standard", ["unmanned aerial vehicle", "UAV", "vehiculo aereo no tripulado"]),
    ("Electronic warfare", "technical_standard", ["electronic warfare", "guerra electronica"]),
    ("Cyber defense", "technical_standard", ["cyber defense", "ciberdefensa", "ciberseguridad"]),
    ("Intelligence surveillance reconnaissance", "technical_standard",
     ["intelligence, surveillance, and reconnaissance", "ISR"]),
    ("Predictive maintenance", "technical_standard", ["predictive maintenance", "mantenimiento predictivo"]),
    ("Simulation and training", "technical_standard", ["simulation and training", "simulacion y entrenamiento"]),
    ("Jamming", "technical_standard", ["jamming", "spoofing", "interferencia"]),
    ("Anti-satellite weapon", "technical_standard", ["anti-satellite", "ASAT", "antisatelite"]),
    ("Space situational awareness", "technical_standard",
     ["space situational awareness", "SSA", "space domain awareness"]),
    ("Space debris", "technical_standard", ["space debris", "orbital debris", "desechos espaciales", "basura espacial"]),
]

# Frases que contienen el nombre de una entidad sin serlo. Se consumen antes y no cuentan.
DECOYS = [
    "Galileo Galilei",
    "ISO 8601",
    "ISO/IEC",
    "Iron Dome for America",  # el programa estadounidense es Golden Dome; este titular nombra al israeli
    "Mars Bar",
]
