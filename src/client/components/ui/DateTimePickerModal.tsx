import { Button } from "@client/components/ui/button";
import { Calendar } from "@client/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@client/components/ui/field";
import { Input } from "@client/components/ui/input";
import * as React from "react";

const getNowTimeString = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

type DateTimePickerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dateTime: Date) => void;
};

export function DateTimePickerModal({
  open,
  onOpenChange,
  onConfirm,
}: DateTimePickerModalProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>();
  const [selectedTime, setSelectedTime] =
    React.useState<string>(getNowTimeString); // lazy initializer
  const [error, setError] = React.useState<string>("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday =
    selectedDate !== undefined &&
    selectedDate.toDateString() === new Date().toDateString();

  const currentTimeString = getNowTimeString();

  React.useEffect(() => {
    if (open) {
      setSelectedDate(undefined);
      setSelectedTime(getNowTimeString());
      setError("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (!selectedDate) {
      onOpenChange(false);
      return;
    }
    const target = new Date(selectedDate.getTime());
    const [hour, minutes] = selectedTime.split(":").map(Number);
    target.setHours(hour, minutes, 0, 0);

    if (target <= new Date()) {
      setError("過去の日時は設定できません");
      return;
    }
    onConfirm(target);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-fit">
        <DialogHeader>
          <DialogTitle>日時を選択</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              setSelectedDate(date);
              setError("");
            }}
            disabled={{ before: today }}
          />

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="time-input">時刻</FieldLabel>
              <Input
                id="time-input"
                type="time"
                value={selectedTime}
                min={isToday ? currentTimeString : undefined}
                onChange={(e) => {
                  setSelectedTime(e.target.value);
                  setError("");
                }}
              />
            </Field>
          </FieldGroup>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedDate}>
            確定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
