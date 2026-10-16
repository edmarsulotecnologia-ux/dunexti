import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export interface TicketPDFData {
  id: string;
  clientName: string;
  whatsapp: string;
  equipment: string;
  problem: string;
  createdAt?: any;
  status: string;
  technicianId?: string;
  startTime?: any;
  endTime?: any;
  solution?: string;
  recommendation?: string;
}

export function safeGetDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {}
  }
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof value.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function safeFormatDate(value: any, formatPattern: string, fallback = '—'): string {
  const d = safeGetDate(value);
  if (!d) return fallback;
  try {
    return format(d, formatPattern);
  } catch {
    return fallback;
  }
}

export function generateTicketPDF(ticket: TicketPDFData): void {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 210;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = 16;

    // Status label translation and color
    const statusLabels: Record<string, { label: string; color: [number, number, number] }> = {
      'pending': { label: 'PENDENTE', color: [234, 88, 12] },
      'in-progress': { label: 'EM MANUTENÇÃO', color: [37, 99, 235] },
      'completed': { label: 'CONCLUÍDO', color: [22, 163, 74] },
      'completed-no-test': { label: 'CONCLUÍDO (S/ TESTE)', color: [13, 148, 136] },
      'needs-next-step': { label: 'AGUARDANDO PEÇA / ETAPA', color: [168, 85, 247] },
    };

    const statusKey = ticket.status || 'pending';
    const statusInfo = statusLabels[statusKey] || { label: String(statusKey).toUpperCase(), color: [71, 85, 105] };

    // ==================== CABEÇALHO ====================
    // Barra superior decorativa
    doc.setFillColor(0, 86, 179); // #0056b3
    doc.rect(0, 0, pageWidth, 5, 'F');

    // Nome da Empresa
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(0, 86, 179);
    doc.text('DUNEX-TI', margin, y + 4);

    // Subtítulo
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('ASSISTÊNCIA TÉCNICA E MANUTENÇÃO ESPECIALIZADA', margin, y + 9);

    // Badge da O.S. (Lado direito)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(pageWidth - margin - 55, y - 2, 55, 16, 2, 2, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('ORDEM DE SERVIÇO', pageWidth - margin - 52, y + 3);

    doc.setFontSize(11);
    doc.setTextColor(0, 86, 179);
    const osId = (ticket.id || 'NOVO').slice(0, 8).toUpperCase();
    doc.text(`#${osId}`, pageWidth - margin - 52, y + 9);

    y += 18;

    // Linha separadora
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Título do Relatório com Badge de Status
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('RELATÓRIO DE ATENDIMENTO E MANUTENÇÃO', margin, y);

    // Badge Status
    const [r, g, b] = statusInfo.color;
    doc.setFillColor(r, g, b);
    doc.roundedRect(pageWidth - margin - 45, y - 4, 45, 6, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(statusInfo.label, pageWidth - margin - 43, y);

    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const emitDate = format(new Date(), 'dd/MM/yyyy HH:mm');
    doc.text(`Emitido em: ${emitDate}`, margin, y + 2);

    y += 7;

    // ==================== SEÇÃO 1: DADOS DO CLIENTE E EQUIPAMENTO ====================
    const boxPadding = 4;
    const colWidth = (contentWidth - 4) / 2;

    // Card Cliente
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colWidth, 26, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 86, 179);
    doc.text('DADOS DO CLIENTE', margin + boxPadding, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Nome:', margin + boxPadding, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const clientNameStr = ticket.clientName || 'Não informado';
    doc.text(doc.splitTextToSize(clientNameStr, colWidth - 25), margin + boxPadding + 12, y + 13);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('WhatsApp:', margin + boxPadding, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(ticket.whatsapp || 'Não informado', margin + boxPadding + 17, y + 20);

    // Card Equipamento
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin + colWidth + 4, y, colWidth, 26, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 86, 179);
    doc.text('DADOS DO EQUIPAMENTO', margin + colWidth + 4 + boxPadding, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Aparelho:', margin + colWidth + 4 + boxPadding, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const equipStr = ticket.equipment || 'Equipamento não especificado';
    doc.text(doc.splitTextToSize(equipStr, colWidth - 25), margin + colWidth + 4 + boxPadding + 16, y + 13);

    y += 30;

    // ==================== PROBLEMA RELATADO ====================
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(254, 202, 202);
    const problemLines = doc.splitTextToSize(ticket.problem || 'Nenhum detalhe informado', contentWidth - 8);
    const problemBoxHeight = Math.max(16, problemLines.length * 4.5 + 10);
    doc.roundedRect(margin, y, contentWidth, problemBoxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 28, 28);
    doc.text('DEFEITO / PROBLEMA RELATADO PELO CLIENTE:', margin + boxPadding, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(problemLines, margin + boxPadding, y + 12);

    y += problemBoxHeight + 5;

    // ==================== SEÇÃO 2: CRONOGRAMA DE ATENDIMENTO ====================
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 86, 179);
    doc.text('CRONOGRAMA DO ATENDIMENTO', margin + boxPadding, y + 6);

    const colDateWidth = contentWidth / 4;
    const dCreated = safeFormatDate(ticket.createdAt, 'dd/MM/yyyy HH:mm', '—');
    const dStart = safeFormatDate(ticket.startTime, 'dd/MM/yyyy HH:mm', '—');
    const dEnd = safeFormatDate(ticket.endTime, 'dd/MM/yyyy HH:mm', ticket.status === 'in-progress' ? 'Em andamento' : '—');

    const startDateObj = safeGetDate(ticket.startTime);
    const endDateObj = safeGetDate(ticket.endTime);

    let durationStr = '—';
    if (startDateObj && endDateObj) {
      const diffMs = endDateObj.getTime() - startDateObj.getTime();
      if (diffMs > 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        durationStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
      }
    }

    // Col 1: Abertura
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Abertura:', margin + boxPadding, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(dCreated, margin + boxPadding, y + 17);

    // Col 2: Início
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Início Manutenção:', margin + colDateWidth + boxPadding, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(dStart, margin + colDateWidth + boxPadding, y + 17);

    // Col 3: Conclusão
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Conclusão:', margin + colDateWidth * 2 + boxPadding, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(dEnd, margin + colDateWidth * 2 + boxPadding, y + 17);

    // Col 4: Duração
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Tempo Total:', margin + colDateWidth * 3 + boxPadding, y + 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 86, 179);
    doc.text(durationStr, margin + colDateWidth * 3 + boxPadding, y + 17);

    y += 26;

    // ==================== SEÇÃO 3: SOLUÇÃO TÉCNICA APLICADA ====================
    const solText = ticket.solution || 'Serviço em andamento ou sem observações de solução registradas.';
    const solLines = doc.splitTextToSize(solText, contentWidth - 8);
    const solBoxHeight = Math.max(20, solLines.length * 4.5 + 12);

    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(margin, y, contentWidth, solBoxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(22, 101, 52);
    doc.text('SOLUÇÃO TÉCNICA EXECUTADA', margin + boxPadding, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(solLines, margin + boxPadding, y + 13);

    y += solBoxHeight + 5;

    // ==================== SEÇÃO 4: RECOMENDAÇÕES AO CLIENTE ====================
    const recText = ticket.recommendation || 'Nenhuma recomendação preventiva adicional informada.';
    const recLines = doc.splitTextToSize(recText, contentWidth - 8);
    const recBoxHeight = Math.max(18, recLines.length * 4.5 + 12);

    doc.setFillColor(254, 249, 195);
    doc.setDrawColor(253, 224, 71);
    doc.roundedRect(margin, y, contentWidth, recBoxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(133, 77, 14);
    doc.text('RECOMENDAÇÕES E ORIENTAÇÕES AO CLIENTE', margin + boxPadding, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(66, 32, 6);
    doc.text(recLines, margin + boxPadding, y + 13);

    y += recBoxHeight + 7;

    // ==================== SEÇÃO 5: TERMO DE ENTREGA E RECEBIMENTO ====================
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 38, 2, 2, 'FD');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const termo = 'Declaro ter recebido o equipamento descrito nesta Ordem de Serviço devidamente reparado e em perfeito estado de funcionamento, ciente dos procedimentos executados e das recomendações técnicas informadas.';
    doc.text(doc.splitTextToSize(termo, contentWidth - 10), margin + boxPadding, y + 6);

    // Linhas de Assinatura
    const signY = y + 26;
    const signColWidth = (contentWidth - 20) / 2;

    // Assinatura Técnico
    doc.setDrawColor(148, 163, 184);
    doc.line(margin + 5, signY, margin + 5 + signColWidth, signY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('DUNEX-TI - TÉCNICO RESPONSÁVEL', margin + 5 + signColWidth / 2, signY + 4, { align: 'center' });

    // Assinatura Cliente
    doc.line(margin + signColWidth + 15, signY, margin + signColWidth + 15 + signColWidth, signY);
    doc.text('ASSINATURA DO CLIENTE', margin + signColWidth + 15 + signColWidth / 2, signY + 4, { align: 'center' });

    // Data de recebimento
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Data: _____/_____/_________', margin + signColWidth + 15 + signColWidth / 2, signY + 8, { align: 'center' });

    // ==================== RODAPÉ DA PÁGINA ====================
    const footerY = 288;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('DUNEX-TI • Assistência Técnica e Suporte em Tecnologia', margin, footerY);
    doc.text(`Documento gerado eletronicamente em ${emitDate}`, pageWidth - margin, footerY, { align: 'right' });

    // Salvar PDF com fallback seguro
    const sanitizedClient = (ticket.clientName || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Relatorio_OS_${(ticket.id || 'OS').slice(0, 6)}_${sanitizedClient}.pdf`;

    try {
      doc.save(fileName);
    } catch (saveErr) {
      console.warn('Fallback direct download:', saveErr);
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 1500);
    }
  } catch (err) {
    console.error('Critical error in generateTicketPDF:', err);
    throw err;
  }
}
