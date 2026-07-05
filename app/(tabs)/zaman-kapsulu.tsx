import { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, FlatList, Image, PanResponder, ActivityIndicator, Dimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl } from "@/lib/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const INDICATOR_HEIGHT = 40; 

type EntryRow = {
  id: string;
  date: string;
  cover_photo_url: string | null;
};

function useTimeCapsuleEntries() {
  return useQuery({
    queryKey: ["entries", "timecapsule"],
    queryFn: async (): Promise<EntryRow[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, photos!entry_id(storage_path)")
        .eq("type", "log")
        .order("date", { ascending: false });

      if (error) throw error;

      return Promise.all(
        (data ?? []).map(async (e: any) => {
          const path = e.photos?.[0]?.storage_path;
          return {
            id: e.id,
            date: e.date,
            cover_photo_url: path ? await getPhotoUrl(path) : null,
          };
        })
      );
    },
  });
}

function formatIndicatorDate(dateString: string) {
  const d = new Date(dateString);
  const month = d.toLocaleDateString("tr-TR", { month: "short" }).toUpperCase();
  const year = d.getFullYear();
  return `${month} ${year}`;
}

export default function ZamanKapsulu() {
  const { data: entries, isLoading, error } = useTimeCapsuleEntries();
  const flatListRef = useRef<FlatList>(null);

  const [listHeight, setListHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Verileri PanResponder (kaydırma çubuğu) içinde taze tutmak için Ref'ler
  const entriesRef = useRef(entries);
  const currentIndexRef = useRef(currentIndex);
  const startIndexRef = useRef(0);
  
  // Sıfıra bölünme (Sonsuzluğa fırlama) hatasını engelleyen boyut hafızası
  const dimensionsRef = useRef({ trackHeight: 0, trackTop: 0, maxIndicatorTop: 0 });

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const trackHeight = listHeight * 0.6; 
  const trackTop = (listHeight - trackHeight) / 2;
  const maxIndicatorTop = trackHeight > 0 ? trackHeight - INDICATOR_HEIGHT : 0;

  // Her listHeight değiştiğinde (render olduğunda) matematiksel hafızayı güncelle
  dimensionsRef.current = { trackHeight, trackTop, maxIndicatorTop };

  const indicatorTop = (entries && entries.length > 1 && maxIndicatorTop > 0) 
    ? (currentIndex / (entries.length - 1)) * maxIndicatorTop 
    : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const currentEntries = entriesRef.current;
        const { trackHeight } = dimensionsRef.current; // Taze yükseklik
        
        if (!currentEntries || currentEntries.length === 0 || trackHeight <= 0) return;

        const locY = evt.nativeEvent.locationY;
        let percentage = locY / trackHeight;
        
        if (percentage < 0 || isNaN(percentage)) percentage = 0;
        if (percentage > 1) percentage = 1;

        let newIndex = Math.floor(percentage * (currentEntries.length - 1));
        
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= currentEntries.length) newIndex = currentEntries.length - 1;

        const targetEntry = currentEntries[newIndex];
        if (!targetEntry) return;

        currentIndexRef.current = newIndex;
        setCurrentIndex(newIndex);
        setActiveDate(formatIndicatorDate(targetEntry.date));
        
        try {
          flatListRef.current?.scrollToIndex({ index: newIndex, animated: false });
        } catch (err) {
          console.log("Zıplama hatası:", err);
        }

        startIndexRef.current = newIndex;
      },

      onPanResponderMove: (evt, gestureState) => {
        const currentEntries = entriesRef.current;
        const { maxIndicatorTop } = dimensionsRef.current; // Taze sınır değeri
        
        // maxIndicatorTop 0'sa işlem yapma (Sonsuzluk hatasını engeller)
        if (!currentEntries || currentEntries.length === 0 || maxIndicatorTop <= 0) return;

        // dy (parmak hareketi) / maxIndicatorTop sayesinde milimetrik oran bulunur
        const indexDelta = (gestureState.dy / maxIndicatorTop) * (currentEntries.length - 1);
        let newIndex = Math.round(startIndexRef.current + indexDelta);

        if (newIndex < 0 || isNaN(newIndex)) newIndex = 0;
        if (newIndex >= currentEntries.length) newIndex = currentEntries.length - 1;

        const targetEntry = currentEntries[newIndex];
        if (!targetEntry) return;

        if (currentIndexRef.current !== newIndex) {
          currentIndexRef.current = newIndex;
          setCurrentIndex(newIndex);
          setActiveDate(formatIndicatorDate(targetEntry.date));
          
          try {
            flatListRef.current?.scrollToIndex({ index: newIndex, animated: false });
          } catch (err) {
            console.log("Sürükleme hatası:", err);
          }
        }
      },
      onPanResponderRelease: () => setIsDragging(false),
      onPanResponderTerminate: () => setIsDragging(false),
    })
  ).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index;
      const currentItem = viewableItems[0].item;
      
      if (!isDragging && index !== null) {
        currentIndexRef.current = index;
        setCurrentIndex(index);
        setActiveDate(formatIndicatorDate(currentItem.date));
      }
    }
  }, [isDragging]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator color="#ffffff" size="large" />
      </View>
    );
  }

  if (error || !entries) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <Text className="text-white">Bir hata oluştu.</Text>
      </View>
    );
  }

  return (
    <View 
      className="flex-1 bg-black relative"
      onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
    >
      {listHeight > 0 && (
        <FlatList
          ref={flatListRef}
          data={entries}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          bounces={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          getItemLayout={(data, index) => ({
            length: listHeight,
            offset: listHeight * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH, height: listHeight }}>
              {item.cover_photo_url ? (
                <Image source={{ uri: item.cover_photo_url }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <View className="w-full h-full bg-zinc-900" />
              )}
            </View>
          )}
        />
      )}

      {/* Dokunma Alanı (Track) */}
      <View 
        {...panResponder.panHandlers}
        className="absolute right-0 z-30 w-12 justify-start items-end pr-3 bg-transparent"
        style={{ 
          height: trackHeight, 
          top: trackTop 
        }}
      >
        <View className="absolute right-3.5 top-0 bottom-0 w-0.5 bg-white/10 rounded-full" pointerEvents="none" />
        
        {/* Hareket Eden Beyaz Çubuk */}
        <View 
          className="w-1.5 rounded-full overflow-hidden absolute right-3"
          pointerEvents="none" // Kendi üzerinde touch event başlatıp matematiği bozmasını engeller
          style={{ 
            height: INDICATOR_HEIGHT,
            top: indicatorTop,
            backgroundColor: isDragging ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)'
          }}
        />
      </View>

      {/* Tarih Baloncuğu */}
      {isDragging && activeDate && (
        <View className="absolute right-14 top-1/2 -translate-y-6 z-10 pointer-events-none">
          <View className="bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
            <Text className="text-white font-bold tracking-widest text-sm">
              {activeDate}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}