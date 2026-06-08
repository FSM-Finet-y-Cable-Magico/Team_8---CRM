import { IsIn } from 'class-validator';

export class UpdateTicketPriorityDto {
  @IsIn(['Alta', 'Media', 'Baja'])
  prioridad!: 'Alta' | 'Media' | 'Baja';
}
