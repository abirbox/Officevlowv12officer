import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTimezone } from '@/contexts/TimezoneContext';

const TimezoneMenu = () => {
  const { preference, timezone, browserTimezone, abbrev, options, setPreference } = useTimezone();
  const isAuto = preference === 'auto';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="timezone-menu-trigger"
          title={`Times shown in ${timezone}`}
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-medium text-[#64748B] dark:text-[#A1A1AA] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A] hover:text-[#0F172A] dark:hover:text-[#FAFAFA] transition-colors"
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline" data-testid="timezone-menu-label">{abbrev || timezone}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[380px] overflow-y-auto">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>Display timezone</span>
          <span className="text-[11px] font-normal text-[#64748B] dark:text-[#A1A1AA]" data-testid="timezone-current-zone">
            Showing times in {timezone}{abbrev ? ` (${abbrev})` : ''}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setPreference('auto')}
          data-testid="timezone-option-auto"
          className="flex items-center justify-between"
        >
          <span className="flex flex-col">
            <span>Auto-detect</span>
            <span className="text-[11px] text-[#64748B] dark:text-[#A1A1AA]">Your device: {browserTimezone}</span>
          </span>
          {isAuto && <Check className="w-4 h-4 text-[#0EA5E9]" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.code}
            onClick={() => setPreference(opt.code)}
            data-testid={`timezone-option-${opt.code}`}
            className="flex items-center justify-between"
          >
            <span>{opt.label}</span>
            {!isAuto && preference === opt.code && <Check className="w-4 h-4 text-[#0EA5E9]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TimezoneMenu;
