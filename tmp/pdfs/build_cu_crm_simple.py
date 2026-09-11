from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from pypdf import PdfReader

root = Path(__file__).resolve().parents[2]
out = root / 'output/pdf/CU_Pendientes_CRM_Incremento_2.pdf'
pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', 'C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold')
title = ParagraphStyle('title', fontName='Arial-Bold', fontSize=15, leading=19, spaceAfter=6)
body = ParagraphStyle('body', fontName='Arial', fontSize=9, leading=12)
small = ParagraphStyle('small', fontName='Arial', fontSize=8, leading=11, textColor=colors.HexColor('#444444'))
rows = [
 ('CU-28', 'Notificación preventiva de cobro', 'Completar la preparación y trazabilidad de avisos; coordinar su entrega con Portal.'),
 ('CU-64', 'Múltiples servicios de un cliente', 'Verificar alta, consulta, cambio y baja de cada servicio.'),
 ('CU-65', 'Perfil individual del servicio', 'Verificar contrato, plan y estado. Mostrar equipos y órdenes desde las integraciones.'),
 ('CU-66', 'Solicitudes de cliente', 'Completar y verificar el registro, la consulta y el seguimiento desde la interfaz.'),
 ('CU-67', 'Origen de captación comercial', 'Verificar que se registre y se conserve al convertir el prospecto en cliente.'),
 ('CU-68', 'Seguimiento comercial consolidado', 'Validar las métricas y los filtros por empresa con datos reales.'),
 ('CU-69', 'Planes comerciales', 'Verificar creación, edición y activación. Incorporar requisitos de equipos usando el catálogo de Inventario.'),
 ('CU-70', 'Zonas y precios por zona', 'Verificar las reglas y la aplicación del precio correspondiente.'),
 ('CU-71', 'Observaciones contextuales', 'Verificar registro, responsable, fecha y consulta en el historial correcto.'),
 ('CU-73', 'Cambio de plan con historial', 'Corregir la fecha efectiva: un cambio futuro debe mantener el plan actual hasta esa fecha.'),
 ('CU-74', 'Contrato digital', 'Completar y verificar generación, consulta y descarga desde la interfaz; revisar versiones y firma manual.'),
]
assert len(rows) == 11
story = [Paragraph('Casos de uso por trabajar - Incremento 2', title),
 Paragraph('Grupo 8 - CRM | 11 casos de responsabilidad funcional del CRM', small), Spacer(1, 6*mm)]
data = [[Paragraph('<b>'+h+'</b>', body) for h in ('CU', 'Caso de uso', 'Trabajo pendiente')]]
data += [[Paragraph(text, body) for text in row] for row in rows]
t = Table(data, colWidths=[19*mm, 62*mm, 97*mm], repeatRows=1, hAlign='LEFT')
t.setStyle(TableStyle([
 ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#EEEEEE')),
 ('GRID',(0,0),(-1,-1),0.45,colors.HexColor('#999999')),
 ('VALIGN',(0,0),(-1,-1),'TOP'),
 ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
 ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
]))
story += [t, Spacer(1, 5*mm), Paragraph('Incluye funciones por completar y funciones ya existentes que necesitan verificación. CU-28, CU-65 y CU-69 requieren coordinación externa para su parte integrada.', small),
 Spacer(1, 2*mm), Paragraph('Alcance: tabla original del incremento 2 y matriz de responsabilidades del Grupo 8. Los flujos compartidos CU-75 y CU-76 se gestionan aparte con FSM.', small)]
SimpleDocTemplate(str(out), pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=17*mm, bottomMargin=16*mm,
 title='Casos de uso por trabajar - Incremento 2 - CRM', author='Grupo 8').build(story)
reader = PdfReader(out)
assert len(reader.pages)==1, f'Expected one page, got {len(reader.pages)}'
text = reader.pages[0].extract_text()
assert all(row[0] in text for row in rows)
print(out)
