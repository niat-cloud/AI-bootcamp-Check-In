import type { EventInfo } from '../../../lib/api';

export interface OverviewRoom {
  id: number;
  name: string;
  capacity: number;
  priority: number;
  isActive: boolean;
  teamSize: number;
  teamSizeOverride: number | null;
  used: number;
  available: number;
  teamCount: number;
  seatCount: number;
  completeTeams: number;
  partialSeats: number;
}

export interface OverviewSeat {
  label: string;
  student: string | null;
  eventParticipantId: number | null;
  checkInTime: string | null;
}

export interface OverviewTeam {
  id: number;
  roomId: number;
  teamNumber: number;
  capacity: number;
  seats: OverviewSeat[];
}

export interface WaitingStudent {
  id: number;
  name: string;
  schoolCollege: string;
  registrationType: 'existing' | 'walk_in';
  arrivedAt: string | null;
}

export interface LogEntry {
  id: number;
  action: string;
  details: Record<string, any>;
  createdBy: string | null;
  createdAt: string;
}

export interface RoomsOverview {
  event: EventInfo;
  stats: {
    expected: number;
    registered: number;
    walkIns: number;
    participants: number;
    arrivals: number;
    assigned: number;
    waiting: number;
    notArrived: number;
    approvedCapacity: number;
    disabledCapacity: number;
    availableSeats: number;
    shortage: number;
    aboveExpected: number;
  };
  rooms: OverviewRoom[];
  teams: OverviewTeam[];
  waiting: WaitingStudent[];
  log: LogEntry[];
}

export type TeamStatus = 'full' | 'partial' | 'empty';

export function teamStatus(team: OverviewTeam): TeamStatus {
  const filled = team.seats.filter((s) => s.student).length;
  return filled === 0 ? 'empty' : filled === team.seats.length ? 'full' : 'partial';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
