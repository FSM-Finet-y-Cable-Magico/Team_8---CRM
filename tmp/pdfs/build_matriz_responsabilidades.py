from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "Matriz_Responsabilidades_Incremento_2.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = landscape(A4)

NAVY = colors.HexColor("#14233B")
BLUE = colors.HexColor("#2367D1")
TEAL = colors.HexColor("#159A93")
ORANGE = colors.HexColor("#EE8A2D")
RED = colors.HexColor("#CC4B4B")
PURPLE = colors.HexColor("#7357C7")
INK = colors.HexColor("#203047")
MUTED = colors.HexColor("#627083")
LINE = colors.HexColor("#D9E1EA")
PALE_BLUE = colors.HexColor("#EAF2FF")
PALE_TEAL = colors.HexColor("#E8F7F5")
PALE_ORANGE = colors.HexColor("#FFF3E5")
PALE_PURPLE = colors.HexColor("#F1EDFF")
PALE_RED = colors.HexColor("#FCEBEC")
WHITE = colors.white
BG = colors.HexColor("#F6F8FB")


pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))

styles = getSampleStyleSheet()
TITLE = ParagraphStyle(
    "TitleCustom", fontName="Arial-Bold", fontSize=25, leading=29,
    textColor=WHITE, alignment=TA_LEFT, spaceAfter=4
)
SUBTITLE = ParagraphStyle(
    "SubtitleCustom", fontName="Arial", fontSize=10.5, leading=15,
    textColor=colors.HexColor("#DCE8FA")
)
H1 = ParagraphStyle(
    "H1Custom", fontName="Arial-Bold", fontSize=18, leading=22,
    textColor=NAVY, spaceAfter=5
)
H2 = ParagraphStyle(
    "H2Custom", fontName="Arial-Bold", fontSize=12, leading=15,
    textColor=NAVY, spaceBefore=2, spaceAfter=5
)
BODY = ParagraphStyle(
    "BodyCustom", fontName="Arial", fontSize=8.8, leading=12.2,
    textColor=INK
)
SMALL = ParagraphStyle(
    "SmallCustom", fontName="Arial", fontSize=7.2, leading=9.3,
    textColor=INK
)
SMALL_WHITE = ParagraphStyle(
    "SmallWhite", fontName="Arial", fontSize=7.4, leading=9.4,
    textColor=WHITE
)
TABLE_HEAD = ParagraphStyle(
    "TableHead", fontName="Arial-Bold", fontSize=7.1, leading=8.5,
    textColor=WHITE, alignment=TA_LEFT
)
TABLE_BODY = ParagraphStyle(
    "TableBody", fontName="Arial", fontSize=6.7, leading=8.6,
    textColor=INK
)
TABLE_BODY_BOLD = ParagraphStyle(
    "TableBodyBold", fontName="Arial-Bold", fontSize=6.8, leading=8.6,
    textColor=NAVY
)
NOTE = ParagraphStyle(
    "Note", fontName="Arial", fontSize=7.5, leading=10,
    textColor=MUTED
)


def P(text, style=BODY):
    return Paragraph(text, style)


class SummaryGraphic(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 255 * mm
        self.height = 56 * mm

    def draw(self):
        c = self.canv
        x = 0
        y = self.height
        counts = [11, 10, 2]
        labels = ["Responsabilidad CRM", "Otros grupos", "Trabajo compartido"]
        palette = [TEAL, ORANGE, PURPLE]
        card_w = 77 * mm
        gap = 8 * mm
        for i, (count, label, color) in enumerate(zip(counts, labels, palette)):
            cx = x + i * (card_w + gap)
            c.setFillColor(WHITE)
            c.roundRect(cx, y - 32 * mm, card_w, 30 * mm, 4 * mm, fill=1, stroke=0)
            c.setFillColor(color)
            c.roundRect(cx, y - 32 * mm, 5 * mm, 30 * mm, 2 * mm, fill=1, stroke=0)
            c.setFont("Arial-Bold", 23)
            c.drawString(cx + 11 * mm, y - 15 * mm, str(count))
            c.setFillColor(INK)
            c.setFont("Arial-Bold", 9)
            c.drawString(cx + 11 * mm, y - 23 * mm, label)

        bar_y = 4 * mm
        bar_w = self.width
        total = sum(counts)
        current = 0
        for count, color in zip(counts, palette):
            width = bar_w * count / total
            c.setFillColor(color)
            c.rect(current, bar_y, width, 7 * mm, fill=1, stroke=0)
            current += width
        c.setFillColor(colors.HexColor("#B9C9DF"))
        c.setFont("Arial", 7.5)
        c.drawString(0, 0, "Distribucion de los 23 casos de uso documentados para el Incremento 2")


class ResponsibilityMap(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 255 * mm
        self.height = 118 * mm

    def _box(self, c, x, y, w, h, fill, title, lines):
        c.setFillColor(fill)
        c.roundRect(x, y, w, h, 4 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE if fill != PALE_BLUE else NAVY)
        c.setFont("Arial-Bold", 12)
        c.drawString(x + 6 * mm, y + h - 10 * mm, title)
        c.setFont("Arial", 8)
        ty = y + h - 19 * mm
        for line in lines:
            c.drawString(x + 6 * mm, ty, line)
            ty -= 5 * mm

    def _arrow(self, c, x1, y1, x2, y2, label):
        c.setStrokeColor(colors.HexColor("#91A0B4"))
        c.setLineWidth(1.4)
        c.line(x1, y1, x2, y2)
        angle = 1 if x2 >= x1 else -1
        c.setFillColor(colors.HexColor("#91A0B4"))
        c.line(x2, y2, x2 - angle * 3 * mm, y2 + 2 * mm)
        c.line(x2, y2, x2 - angle * 3 * mm, y2 - 2 * mm)

    def draw(self):
        c = self.canv
        self._box(c, 83 * mm, 39 * mm, 89 * mm, 48 * mm, BLUE, "GRUPO 8 - CRM", [
            "Prospectos y clientes comerciales", "Planes, contratos y servicios", "Cobranza y seguimiento comercial"
        ])
        self._box(c, 0, 82 * mm, 67 * mm, 31 * mm, TEAL, "GRUPO 1", ["Equipos, stock y bodegas", "Movimientos, garantia y mantenimiento"])
        self._box(c, 188 * mm, 82 * mm, 67 * mm, 31 * mm, PURPLE, "GRUPO 2", ["Portal del cliente", "Checkout y experiencia web"])
        self._box(c, 0, 0, 67 * mm, 31 * mm, ORANGE, "GRUPO 3", ["OT, tecnicos e instalaciones", "Cobertura, evidencia y SmartOLT"])
        self._box(c, 188 * mm, 0, 67 * mm, 31 * mm, NAVY, "REGLA COMUN", ["API REST + eventos", "request_id, event_id y trace_id"])

        self._arrow(c, 67 * mm, 97 * mm, 83 * mm, 76 * mm, "consulta")
        self._arrow(c, 172 * mm, 76 * mm, 188 * mm, 97 * mm, "publica API")
        self._arrow(c, 67 * mm, 16 * mm, 83 * mm, 48 * mm, "eventos OT")
        self._arrow(c, 172 * mm, 48 * mm, 188 * mm, 16 * mm, "trazabilidad")

        c.setFillColor(PALE_RED)
        c.roundRect(74 * mm, 96 * mm, 107 * mm, 18 * mm, 3 * mm, fill=1, stroke=0)
        c.setFillColor(RED)
        c.setFont("Arial-Bold", 8.5)
        c.drawCentredString(127.5 * mm, 106 * mm, "Una sola fuente de verdad por dominio")
        c.setFillColor(INK)
        c.setFont("Arial", 7)
        c.drawCentredString(127.5 * mm, 101 * mm, "El CRM consulta y conserva referencias; no administra datos ajenos")


class RoadmapGraphic(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 255 * mm
        self.height = 55 * mm

    def draw(self):
        c = self.canv
        steps = [
            ("1", "Cerrar CRM", "Verificar CU propios\ny corregir CU-73", TEAL),
            ("2", "Publicar APIs", "Deuda, pagos, contratos,\nleads y consultas para G2", BLUE),
            ("3", "Integrar", "Inventario G1 y\nFSM/SmartOLT G3", ORANGE),
            ("4", "Retirar duplicados", "Ocultar acciones locales\ndespues de validar APIs", PURPLE),
        ]
        card_w = 56 * mm
        gap = 10 * mm
        for i, (number, title, body, color) in enumerate(steps):
            x = i * (card_w + gap)
            c.setFillColor(WHITE)
            c.roundRect(x, 3 * mm, card_w, 44 * mm, 4 * mm, fill=1, stroke=0)
            c.setFillColor(color)
            c.circle(x + 9 * mm, 37 * mm, 5 * mm, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Arial-Bold", 10)
            c.drawCentredString(x + 9 * mm, 35.5 * mm, number)
            c.setFillColor(NAVY)
            c.setFont("Arial-Bold", 9)
            c.drawString(x + 17 * mm, 35 * mm, title)
            c.setFillColor(INK)
            c.setFont("Arial", 7.2)
            yy = 25 * mm
            for line in body.split("\n"):
                c.drawString(x + 7 * mm, yy, line)
                yy -= 5 * mm
            if i < len(steps) - 1:
                c.setStrokeColor(colors.HexColor("#A6B2C2"))
                c.setLineWidth(1.2)
                c.line(x + card_w + 1 * mm, 25 * mm, x + card_w + gap - 1 * mm, 25 * mm)


def table(data, widths, header=BLUE, row_fills=None, font_size=6.7):
    converted = []
    for ridx, row in enumerate(data):
        converted.append([
            P(str(cell), TABLE_HEAD if ridx == 0 else (TABLE_BODY_BOLD if cidx == 0 else TABLE_BODY))
            for cidx, cell in enumerate(row)
        ])
    result = Table(converted, colWidths=widths, repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), header),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for ridx in range(1, len(data)):
        fill = row_fills[ridx - 1] if row_fills else (WHITE if ridx % 2 else BG)
        commands.append(("BACKGROUND", (0, ridx), (-1, ridx), fill))
    result.setStyle(TableStyle(commands))
    return result


crm_rows = [
    ["CU", "Caso de uso", "Estado", "Trabajo del Grupo 8"],
    ["CU-28", "Notificacion preventiva de cobro", "Parcial", "Mantener calculo y trazabilidad; publicar consultas de vencimientos para G2."],
    ["CU-64", "Multiples servicios por cliente", "Implementado", "Verificar alta, consulta, cambio y baja por servicio."],
    ["CU-65", "Perfil individual del servicio", "Implementado", "Agregar equipos G1 y OT G3 en modo lectura."],
    ["CU-66", "Solicitudes de cliente", "Implementado", "Probar creacion, consulta, estado, factibilidad, permisos y auditoria."],
    ["CU-67", "Origen de captacion", "Implementado", "Verificar que sobreviva a la conversion a cliente."],
    ["CU-68", "Seguimiento comercial consolidado", "Implementado", "Validar metricas por empresa con datos reales."],
    ["CU-69", "Planes comerciales", "Parcial integracion", "Agregar requisitos por tipo de equipo usando catalogo de G1."],
    ["CU-70", "Zonas y precios por zona", "Implementado", "Verificar reglas, permisos y precio aplicado."],
    ["CU-71", "Observaciones contextuales", "Implementado", "Verificar contexto, visibilidad, autor, fecha e historial."],
    ["CU-73", "Cambio de plan con historial", "Parcial", "Corregir cambios futuros: no aplicar antes de la fecha efectiva."],
    ["CU-74", "Contrato digital", "Implementado", "Probar PDF, versiones, firma manual, permisos y auditoria."],
]

external_rows = [
    ["CU", "Caso de uso", "Propietario", "Decision para CRM"],
    ["CU-38", "Autenticacion del portal", "G2", "Retirar pantalla local; exponer datos autorizados."],
    ["CU-39", "Plan contratado en portal", "G2", "Retirar pantalla; publicar contratos y servicios."],
    ["CU-41", "Ticket desde portal", "G2", "G2 crea; G8 recibe mediante API autenticada."],
    ["CU-55", "Diagnostico de equipo devuelto", "G1", "Solo consultar resumen cuando sea necesario."],
    ["CU-56", "Stock de consumibles", "G1", "Solo disponibilidad informativa."],
    ["CU-57", "Alerta de stock bajo", "G1", "Mostrar alerta externa si aporta al flujo comercial."],
    ["CU-58", "Transferencia entre empresas", "G1", "Retirar por completo del CRM."],
    ["CU-60", "Evidencia multimedia", "G3", "Consultar evidencia asociada al cierre de OT."],
    ["CU-63", "Mantenimiento de equipos", "G1/G3", "Mostrar historial externo en modo lectura."],
    ["CU-72", "Modalidad del equipo", "G1", "Mostrar valor externo; no editarlo en CRM."],
]

shared_rows = [
    ["CU", "Flujo compartido", "Responsabilidad CRM", "Responsabilidad FSM"],
    ["CU-75", "Ticket a orden de trabajo", "Enviar solicitud, guardar request_id, trace_id e id_ot.", "Crear, asignar y administrar la OT."],
    ["CU-76", "Codigo de la orden", "Mostrar y almacenar el identificador externo.", "Generar el id y codigo oficial de la OT."],
]

integration_rows = [
    ["ID", "Capacidad que debe publicar G8", "Estado"],
    ["G8-1", "Deuda por RUT o codigo de abonado", "Falta contrato publico"],
    ["G8-2", "Solicitud de cambio Wi-Fi desde G2", "Falta receptor e integracion tecnica"],
    ["G8-3", "Webhook de pagos confirmados", "Falta endpoint idempotente"],
    ["G8-4", "Contratos por RUT", "Falta contrato publico"],
    ["G8-5", "Actualizar telefono y correo", "Falta endpoint limitado y auditado"],
    ["G8-6", "Recibir leads", "Reutilizar prospectos con idempotencia"],
    ["G8-7", "Comprobante de pago PDF", "Falta definir fuente del documento"],
    ["G8-8", "Listas de vencimientos, morosos y pagos", "Faltan filtros para polling de G2"],
]


def first_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#1D3558"))
    canvas.circle(PAGE_W - 5 * mm, PAGE_H + 8 * mm, 58 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#24436F"))
    canvas.circle(PAGE_W - 24 * mm, -10 * mm, 42 * mm, fill=1, stroke=0)
    canvas.restoreState()


def later_pages(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 12 * mm, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Arial-Bold", 8)
    canvas.drawString(14 * mm, PAGE_H - 8 * mm, "Grupo 8 | Matriz de responsabilidades | Incremento 2")
    canvas.setFillColor(MUTED)
    canvas.setFont("Arial", 7)
    canvas.drawRightString(PAGE_W - 14 * mm, 8 * mm, f"Pagina {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    str(OUTPUT), pagesize=landscape(A4),
    leftMargin=18 * mm, rightMargin=18 * mm,
    topMargin=20 * mm, bottomMargin=15 * mm,
    title="Matriz de responsabilidades - Incremento 2",
    author="Grupo 8 - CRM y Gestion Comercial",
)

story = []

# Pagina 1
story.append(Spacer(1, 9 * mm))
story.append(P("MATRIZ DE RESPONSABILIDADES", TITLE))
story.append(P("Incremento 2 - CRM, integraciones y trabajo entre grupos", TITLE))
story.append(Spacer(1, 3 * mm))
story.append(P("Una vista ejecutiva para decidir que debe desarrollar el Grupo 8, que debe consumir por API y que debe retirar cuando las integraciones esten validadas.", SUBTITLE))
story.append(Spacer(1, 13 * mm))
story.append(SummaryGraphic())
story.append(Spacer(1, 6 * mm))

help_cards = [
    [P("QUE TRAE", TABLE_HEAD), P("EN QUE AYUDA", TABLE_HEAD), P("DECISION PRINCIPAL", TABLE_HEAD)],
    [P("Los 23 CU del incremento, ocho obligaciones API, pendientes heredados y una ruta de cuatro etapas.", SMALL_WHITE),
     P("Evita desarrollar funciones de otros grupos, permite priorizar y ofrece criterios claros para declarar un CU verificado.", SMALL_WHITE),
     P("Cerrar primero lo que depende solo del CRM; integrar despues; retirar duplicados al final.", SMALL_WHITE)],
]
cards = Table(help_cards, colWidths=[81 * mm, 81 * mm, 81 * mm], rowHeights=[9 * mm, 28 * mm])
cards.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#31517D")),
    ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#1C304E")),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#4C6385")),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#4C6385")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
]))
story.append(cards)
story.append(PageBreak())

# Pagina 2
story.append(P("Mapa de responsabilidades", H1))
story.append(P("El propietario del dominio crea y modifica sus datos. Los demas grupos consultan por API o reciben eventos.", BODY))
story.append(Spacer(1, 5 * mm))
story.append(ResponsibilityMap())
story.append(Spacer(1, 4 * mm))
decision = Table([[P("POR QUE IMPORTA", TABLE_HEAD), P("La base compartida no autoriza a un grupo a escribir las tablas de otro. Esta separacion evita inventarios duplicados, estados distintos para una misma OT y clientes desincronizados.", BODY)]], colWidths=[42 * mm, 207 * mm])
decision.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), RED),
    ("BACKGROUND", (1, 0), (1, 0), PALE_RED),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E9B7BA")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.append(decision)
story.append(PageBreak())

# Pagina 3
story.append(P("11 casos que permanecen en el CRM", H1))
story.append(P("Estos casos deben quedar funcionales, demostrables y cubiertos por la interfaz del Grupo 8.", BODY))
story.append(Spacer(1, 4 * mm))
fills = [PALE_ORANGE if row[2].startswith("Parcial") else WHITE if i % 2 == 0 else BG for i, row in enumerate(crm_rows[1:])]
story.append(table(crm_rows, [18 * mm, 69 * mm, 38 * mm, 124 * mm], TEAL, fills))
story.append(Spacer(1, 5 * mm))
story.append(P("Prioridad inmediata: corregir CU-73 y probar de punta a punta CU-64 a CU-71 y CU-74. CU-28 avanza junto con las APIs de cobranza para Portal.", NOTE))
story.append(PageBreak())

# Pagina 4
story.append(P("10 casos que pasan a otros grupos", H1))
story.append(P("El codigo local es temporal o duplicado. Se retira solo despues de validar la API sustituta.", BODY))
story.append(Spacer(1, 4 * mm))
owner_fill = {"G1": PALE_TEAL, "G2": PALE_PURPLE, "G3": PALE_ORANGE, "G1/G3": PALE_ORANGE}
fills = [owner_fill[row[2]] for row in external_rows[1:]]
story.append(table(external_rows, [18 * mm, 80 * mm, 27 * mm, 124 * mm], ORANGE, fills))
story.append(Spacer(1, 5 * mm))
story.append(P("Desistir no significa borrar de inmediato. Significa dejar de evolucionar la funcion local, conectar la fuente oficial y retirar la duplicacion cuando la integracion este estable.", NOTE))
story.append(PageBreak())

# Pagina 5
story.append(P("Trabajo compartido y APIs que debe entregar el CRM", H1))
story.append(P("Las ordenes pertenecen a FSM; el CRM inicia el flujo y conserva trazabilidad. En paralelo, Portal necesita datos comerciales publicados por G8.", BODY))
story.append(Spacer(1, 4 * mm))
story.append(table(shared_rows, [18 * mm, 58 * mm, 86 * mm, 87 * mm], PURPLE, [PALE_PURPLE, PALE_PURPLE]))
story.append(Spacer(1, 7 * mm))
story.append(P("Ocho obligaciones de integracion del Grupo 8", H2))
story.append(table(integration_rows, [20 * mm, 139 * mm, 90 * mm], BLUE, [WHITE if i % 2 == 0 else PALE_BLUE for i in range(8)]))
story.append(Spacer(1, 4 * mm))
story.append(P("Todas estas APIs requieren autenticacion entre servicios, idempotencia y trazabilidad. Las claves nunca deben llegar al navegador.", NOTE))
story.append(PageBreak())

# Pagina 6
story.append(P("Linea de trabajo recomendada", H1))
story.append(P("El orden reduce bloqueos: primero cerramos lo controlable por G8; despues publicamos contratos; luego conectamos servicios externos.", BODY))
story.append(Spacer(1, 6 * mm))
story.append(RoadmapGraphic())
story.append(Spacer(1, 7 * mm))

verification = [
    ["UN CU ESTA VERIFICADO CUANDO", "PENDIENTES HEREDADOS", "ACUERDOS QUE FALTAN"],
    [
        "Funciona desde la interfaz; persiste datos; respeta rol, empresa y estados; audita; controla errores y reintentos; tiene prueba automatizada y recorrido manual.",
        "CU-08 estado cliente; CU-13 morosidad automatica; CU-14 historial; CU-16 churn; CU-30/31 suspension y reactivacion; CU-44 gestion completa de usuarios.",
        "Desistimiento formal de Inventario; propietario de credenciales del portal; autenticacion entre servicios; URLs finales; SmartOLT; catalogos de estados.",
    ]
]
ver_table = Table(
    [[P(cell, TABLE_HEAD) for cell in verification[0]], [P(cell, SMALL) for cell in verification[1]]],
    colWidths=[81 * mm, 81 * mm, 81 * mm]
)
ver_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), TEAL),
    ("BACKGROUND", (1, 0), (1, 0), ORANGE),
    ("BACKGROUND", (2, 0), (2, 0), PURPLE),
    ("BACKGROUND", (0, 1), (0, 1), PALE_TEAL),
    ("BACKGROUND", (1, 1), (1, 1), PALE_ORANGE),
    ("BACKGROUND", (2, 1), (2, 1), PALE_PURPLE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.append(ver_table)
story.append(Spacer(1, 7 * mm))
story.append(P("Como usar esta matriz", H2))
story.append(P("1. Tomarla como backlog del Incremento 2.  2. No asignar al CRM tareas marcadas como G1, G2 o G3.  3. Convertir cada fila CRM en una prueba demostrable.  4. No retirar funciones temporales hasta que el endpoint externo este operativo.", BODY))
story.append(Spacer(1, 5 * mm))
story.append(P("Fuentes: CU Incremento 1, CU Incremento 2, Cobertura CU, guia global de endpoints v2, solicitud de dependencias del CRM y codigo actual de develop. Revision: 11-09-2026.", NOTE))

doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
print(OUTPUT)
