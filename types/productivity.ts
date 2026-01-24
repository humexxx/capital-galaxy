export type BoardColumn = {
  id: string;
  userId: string;
  name: string;
  title: string; // Alias for name
  order: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type BoardTask = {
  id: string;
  userId: string;
  columnId: string;
  roadPathId: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  order: number;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type BoardTaskWithColumn = BoardTask & {
  column: BoardColumn;
};

export type BoardColumnWithTasks = BoardColumn & {
  tasks: BoardTask[];
};

export type RoadPathFrequency = "daily" | "every_other_day" | "weekly" | "biweekly" | "monthly";

export type RoadPath = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
  startDate: Date | null;
  targetDate: Date | null;
  autoCreateTasks: number;
  frequency: RoadPathFrequency | null; // Alias for taskFrequency
  taskFrequency: RoadPathFrequency | null;
  lastTaskCreatedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type RoadPathMilestone = {
  id: string;
  roadPathId: string;
  title: string;
  description: string | null;
  targetValue: string | null;
  order: number;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type RoadPathProgress = {
  id: string;
  roadPathId: string;
  value: string;
  currentValue: number; // Parsed number version
  notes: string | null;
  date: Date | null;
  createdAt: Date | null;
};

export type RoadPathWithDetails = RoadPath & {
  milestones: RoadPathMilestone[];
  progress: RoadPathProgress[];
  tasks: BoardTask[];
};

export type RoadPathStats = {
  totalProgress: number;
  currentValue: number;
  progressPercentage: number;
  completedMilestones: number;
  milestonesCompleted: number; // Alias
  totalMilestones: number;
  daysRemaining: number | null;
  progressRate: number;
};
