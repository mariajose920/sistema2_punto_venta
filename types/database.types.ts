export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      Usuario: {
        Row: {
          id: string
          rol: string
        }
        Insert: {
          id: string
          rol: string
        }
        Update: {
          id?: string
          rol?: string
        }
        Relationships: []
      }
      Producto: {
        Row: {
          id: string
          codigo: string
          nombre: string
          categoria: string
          precio_compra: number
          precio_venta: number
          stock: number
        }
        Insert: {
          id?: string
          codigo: string
          nombre: string
          categoria: string
          precio_compra: number
          precio_venta: number
          stock: number
        }
        Update: {
          id?: string
          codigo?: string
          nombre?: string
          categoria?: string
          precio_compra?: number
          precio_venta?: number
          stock?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
