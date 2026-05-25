import { Navigation, Car, ChevronRight } from "lucide-react";

interface RoleSelectProps {
  onSelect: (role: "rider" | "driver") => void;
  userName: string;
}

export default function RoleSelect({ onSelect, userName }: RoleSelectProps) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center mx-auto shadow-xl mb-4">
            <Navigation size={28} className="text-zinc-950 fill-zinc-950 rotate-45" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Welcome, {userName.split(" ")[0]}!</h1>
          <p className="text-zinc-400 text-sm font-medium">How will you use GitaRide?</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => onSelect("rider")}
            className="w-full p-6 rounded-2xl bg-zinc-900 border-2 border-zinc-800 hover:border-white transition-all text-left group active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                  <Navigation size={22} className="text-white" />
                </div>
                <div>
                  <p className="font-black text-base text-white">I'm a Rider</p>
                  <p className="text-zinc-400 text-xs font-medium mt-0.5">Book rides, track drivers, pay online</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-zinc-600 group-hover:text-white transition-colors" />
            </div>
          </button>

          <button
            onClick={() => onSelect("driver")}
            className="w-full p-6 rounded-2xl bg-zinc-900 border-2 border-zinc-800 hover:border-white transition-all text-left group active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg">
                  <Car size={22} className="text-white" />
                </div>
                <div>
                  <p className="font-black text-base text-white">I'm a Driver</p>
                  <p className="text-zinc-400 text-xs font-medium mt-0.5">Accept rides, earn money, navigate routes</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-zinc-600 group-hover:text-white transition-colors" />
            </div>
          </button>
        </div>

        <p className="text-center text-zinc-600 text-xs font-medium">You can switch roles from your profile settings anytime.</p>
      </div>
    </div>
  );
}
