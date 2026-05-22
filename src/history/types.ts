// Shared data shapes for history/ entry (userAnswer history + mentoLec/view).

export interface RawLectureRow {
  no: string;
  type: string;
  title: string;
  url: string;
  qustnrSn: string;
  author: string;
  dateTimeText: string;
  dateStr: string;
  registerDate: string;
  status: string;
  approval: string;
  hasCancelButton: boolean;
}

export interface LectureDetails {
  mentorName: string;
  location: string;
  people: string;
  approvalStatus: string;
  deadlineStatus: string;
  lectureDateTimeText?: string;
}

export interface Lecture extends RawLectureRow {
  mentorName: string;
  location: string;
  people: string;
  approvalStatus: string;
  deadlineStatus: string;
  cancelAllowed: boolean;
  cancelPolicyReason: string;
}
